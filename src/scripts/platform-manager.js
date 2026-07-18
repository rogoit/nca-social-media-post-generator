import { PLATFORM_CONFIGS, PLATFORM_PREFIXES } from "./types.js";
import { getElement, hideElement, showElement, setTextContent } from "./utils.js";

const DISPLAYABLE_PLATFORMS = ["youtube", "linkedin", "twitter", "instagram", "tiktok"];

const POST_DISPLAY = {
  linkedin: { postField: "linkedinPost", contentId: "linkedin-content-result" },
  twitter: { postField: "twitterPost", contentId: "twitter-content-result" },
  instagram: { postField: "instagramPost", contentId: "instagram-content-result" },
  tiktok: { postField: "tiktokPost", contentId: "tiktok-content-result" },
};

export class PlatformManager {
  constructor() {
    this.currentPlatform = "youtube";
    this.tabs = {};
    this.contents = {};
    this.results = {};
    this.spinners = {};

    this.initializeElements();
    this.setupTabListeners();
  }

  initializeElements() {
    for (const platform of DISPLAYABLE_PLATFORMS) {
      const prefix = PLATFORM_PREFIXES[platform];
      this.tabs[platform] = getElement(`${platform}-tab`);
      this.contents[platform] = getElement(`${platform}-content`);
      this.results[platform] = getElement(`${prefix}-result`);
      this.spinners[platform] = getElement(`${platform}-spinner`);
    }
  }

  setupTabListeners() {
    for (const [platform, tab] of Object.entries(this.tabs)) {
      tab.addEventListener("click", () => {
        this.switchToPlatform(platform);
      });
    }
  }

  switchToPlatform(platform) {
    if (platform === "keywords") return;

    this.currentPlatform = platform;

    for (const [p, tab] of Object.entries(this.tabs)) {
      const config = PLATFORM_CONFIGS[p];
      const isActive = p === platform;

      tab.classList.remove(
        "border-b-2",
        "text-red-600",
        "border-red-600",
        "text-blue-600",
        "border-blue-600",
        "text-black",
        "border-black",
        "text-pink-600",
        "border-pink-600",
        "text-gray-500"
      );

      if (isActive) {
        tab.classList.add(
          "border-b-2",
          `text-${config.color.primary}`,
          `border-${config.color.primary}`
        );
      } else {
        tab.classList.add("text-gray-500");
      }
    }

    for (const [p, content] of Object.entries(this.contents)) {
      if (p === platform) {
        showElement(content);
      } else {
        hideElement(content);
      }
    }

    this.updateResultsVisibility();
  }

  showLoading(platform) {
    showElement(getElement("loading"));
    Object.values(this.spinners).forEach((s) => hideElement(s));
    if (this.spinners[platform]) showElement(this.spinners[platform]);
    Object.values(this.results).forEach((r) => hideElement(r));
    hideElement(getElement("error"));
  }

  hideLoading() {
    hideElement(getElement("loading"));
  }

  displayResults(platform, data) {
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

  displayYouTubeResults(data) {
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

  displayPostResults(platform, data) {
    const config = POST_DISPLAY[platform];
    if (!config) return;

    setTextContent(getElement(config.contentId), data[config.postField] || "");
    if (data.modelUsed) {
      setTextContent(getElement(`${PLATFORM_PREFIXES[platform]}-model-name`), data.modelUsed);
    }
  }

  updateResultsVisibility() {
    for (const [platform, result] of Object.entries(this.results)) {
      if (platform === this.currentPlatform && this.hasResultContent(platform)) {
        showElement(result);
      } else {
        hideElement(result);
      }
    }
  }

  hasResultContent(platform) {
    if (platform === "youtube") {
      return !!(
        getElement("title-content").textContent || getElement("description-content").textContent
      );
    }
    const config = POST_DISPLAY[platform];
    if (!config) return false;
    return !!getElement(config.contentId).textContent;
  }

  getCurrentPlatform() {
    return this.currentPlatform;
  }
}
