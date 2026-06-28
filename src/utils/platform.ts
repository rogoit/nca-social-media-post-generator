import type { SocialMediaPlatform, GenerateResponse } from "../types/index.js";
import { PLATFORM_CONFIGS, PLATFORM_PREFIXES } from "../config/constants.js";
import { getElement, hideElement, showElement, setTextContent } from "./dom.js";

const DISPLAYABLE_PLATFORMS: SocialMediaPlatform[] = [
  "youtube", "linkedin", "twitter", "instagram", "tiktok",
];

type PostField = "linkedinPost" | "twitterPost" | "instagramPost" | "tiktokPost";

const POST_DISPLAY: Record<Exclude<SocialMediaPlatform, "youtube" | "keywords">, {
  postField: PostField;
  contentId: string;
}> = {
  linkedin: { postField: "linkedinPost", contentId: "linkedin-content-result" },
  twitter: { postField: "twitterPost", contentId: "twitter-content-result" },
  instagram: { postField: "instagramPost", contentId: "instagram-content-result" },
  tiktok: { postField: "tiktokPost", contentId: "tiktok-content-result" },
};

export class PlatformManager {
  private currentPlatform: SocialMediaPlatform = "youtube";
  private tabs: Partial<Record<SocialMediaPlatform, HTMLElement>> = {};
  private contents: Partial<Record<SocialMediaPlatform, HTMLElement>> = {};
  private results: Partial<Record<SocialMediaPlatform, HTMLElement>> = {};
  private spinners: Partial<Record<SocialMediaPlatform, HTMLElement>> = {};

  constructor() {
    this.initializeElements();
    this.setupTabListeners();
  }

  private initializeElements(): void {
    for (const platform of DISPLAYABLE_PLATFORMS) {
      const prefix = PLATFORM_PREFIXES[platform];
      this.tabs[platform] = getElement(`${platform}-tab`);
      this.contents[platform] = getElement(`${platform}-content`);
      this.results[platform] = getElement(`${prefix}-result`);
      this.spinners[platform] = getElement(`${platform}-spinner`);
    }
  }

  private setupTabListeners(): void {
    for (const [platform, tab] of Object.entries(this.tabs)) {
      tab!.addEventListener("click", () => {
        this.switchToPlatform(platform as SocialMediaPlatform);
      });
    }
  }

  switchToPlatform(platform: SocialMediaPlatform): void {
    if (platform === "keywords") return;

    this.currentPlatform = platform;

    for (const [p, tab] of Object.entries(this.tabs)) {
      const config = PLATFORM_CONFIGS[p as SocialMediaPlatform];
      const isActive = p === platform;

      tab!.classList.remove(
        "border-b-2",
        "text-red-600", "border-red-600",
        "text-blue-600", "border-blue-600",
        "text-black", "border-black",
        "text-pink-600", "border-pink-600",
        "text-gray-500"
      );

      if (isActive) {
        tab!.classList.add("border-b-2", `text-${config.color.primary}`, `border-${config.color.primary}`);
      } else {
        tab!.classList.add("text-gray-500");
      }
    }

    for (const [p, content] of Object.entries(this.contents)) {
      if (p === platform) {
        showElement(content!);
      } else {
        hideElement(content!);
      }
    }

    this.updateResultsVisibility();
  }

  showLoading(platform: SocialMediaPlatform): void {
    showElement(getElement("loading"));
    Object.values(this.spinners).forEach((s) => hideElement(s!));
    if (this.spinners[platform]) showElement(this.spinners[platform]!);
    Object.values(this.results).forEach((r) => hideElement(r!));
    hideElement(getElement("error"));
  }

  hideLoading(): void {
    hideElement(getElement("loading"));
  }

  displayResults(platform: SocialMediaPlatform, data: GenerateResponse): void {
    this.hideLoading();
    const result = this.results[platform];
    if (!result) return;
    showElement(result);

    if (platform === "youtube") {
      this.displayYouTubeResults(data);
    } else {
      this.displayPostResults(platform, data);
    }

    showElement(getElement(`${PLATFORM_PREFIXES[platform]}-copy-buttons`));
  }

  private displayYouTubeResults(data: GenerateResponse): void {
    setTextContent(getElement("transcript-content"), data.transcript || "");
    setTextContent(getElement("title-content"), data.title || "");
    setTextContent(getElement("description-content"), data.description || "");

    const timestampsSection = getElement("timestamps-section");
    const timestampsContent = getElement("timestamps-content");
    const copyTimestampsBtn = getElement("copy-timestamps-btn");
    if (data.timestamps) {
      setTextContent(timestampsContent, data.timestamps);
      showElement(timestampsSection);
      showElement(copyTimestampsBtn);
    } else {
      hideElement(timestampsSection);
      hideElement(copyTimestampsBtn);
    }

    if (data.transcriptCleaned) showElement(getElement("transcript-cleaned"));
    if (data.modelUsed) setTextContent(getElement("model-name"), data.modelUsed);
  }

  private displayPostResults(platform: SocialMediaPlatform, data: GenerateResponse): void {
    const config = POST_DISPLAY[platform as keyof typeof POST_DISPLAY];
    if (!config) return;

    setTextContent(getElement(config.contentId), (data as any)[config.postField] || "");
    if (data.modelUsed) {
      setTextContent(getElement(`${PLATFORM_PREFIXES[platform]}-model-name`), data.modelUsed);
    }
  }

  private updateResultsVisibility(): void {
    for (const [platform, result] of Object.entries(this.results)) {
      if (platform === this.currentPlatform && this.hasResultContent(platform as SocialMediaPlatform)) {
        showElement(result!);
      } else {
        hideElement(result!);
      }
    }
  }

  private hasResultContent(platform: SocialMediaPlatform): boolean {
    if (platform === "youtube") {
      return !!(getElement("title-content").textContent || getElement("description-content").textContent);
    }
    const config = POST_DISPLAY[platform as keyof typeof POST_DISPLAY];
    if (!config) return false;
    return !!getElement(config.contentId).textContent;
  }

  getCurrentPlatform(): SocialMediaPlatform {
    return this.currentPlatform;
  }
}
