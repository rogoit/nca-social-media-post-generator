import {
  getElement,
  hideElement,
  showElement,
  setTextContent,
  displayError,
  hideError,
} from "./utils.js";

export class VideoUploadApp {
  constructor() {
    this.videoFile = null;
    this.videoBase64 = null;
    this.generatedData = null;
    this.approvedPlatforms = new Set();
    this.initializeElements();
    this.setupEventListeners();
  }

  initializeElements() {
    // Tabs
    this.modeTranscriptTab = getElement("mode-transcript-tab");
    this.modeVideoTab = getElement("mode-video-tab");
    this.tabTranscriptContent = getElement("tab-transcript-content");
    this.tabVideoContent = getElement("tab-video-content");

    // Video upload
    this.videoDropzone = getElement("video-dropzone");
    this.videoFileInput = getElement("video-file-input");
    this.videoPreviewContainer = getElement("video-preview-container");
    this.videoPreview = getElement("video-preview");
    this.videoRemoveBtn = getElement("video-remove-btn");
    this.videoGenerateBtn = getElement("video-generate-btn");

    // Progress
    this.videoProgress = getElement("video-progress");
    this.progressTranscript = getElement("progress-transcript");
    this.progressKeywords = getElement("progress-keywords");
    this.progressContent = getElement("progress-content");

    // Platform approval
    this.platformApproval = getElement("platform-approval");
    this.sendToN8nBtn = getElement("send-to-n8n-btn");

    // Error (shared with transcript tab)
    this.errorDiv = getElement("error");
    this.errorMessage = getElement("error-message");
  }

  setupEventListeners() {
    // Tab switching
    this.modeTranscriptTab.addEventListener("click", () => this.switchTab("transcript"));
    this.modeVideoTab.addEventListener("click", () => this.switchTab("video"));

    // Video dropzone
    this.videoDropzone.addEventListener("click", () => this.videoFileInput.click());
    this.videoDropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      this.videoDropzone.classList.add("border-indigo-500", "bg-indigo-50");
    });
    this.videoDropzone.addEventListener("dragleave", () => {
      this.videoDropzone.classList.remove("border-indigo-500", "bg-indigo-50");
    });
    this.videoDropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      this.videoDropzone.classList.remove("border-indigo-500", "bg-indigo-50");
      const file = e.dataTransfer.files[0];
      if (file) this.handleVideoSelect(file);
    });

    // File input
    this.videoFileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) this.handleVideoSelect(file);
    });

    // Remove video
    this.videoRemoveBtn.addEventListener("click", () => this.removeVideo());

    // Generate
    this.videoGenerateBtn.addEventListener("click", () => this.handleGenerate());

    // Approve/Regenerate buttons
    document.querySelectorAll(".approve-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const platform = e.target.dataset.platform;
        this.approvePlatform(platform);
      });
    });

    document.querySelectorAll(".regenerate-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const platform = e.target.dataset.platform;
        this.regeneratePlatform(platform);
      });
    });

    // Send to n8n
    this.sendToN8nBtn.addEventListener("click", () => this.sendToN8n());
  }

  switchTab(mode) {
    if (mode === "transcript") {
      showElement(this.tabTranscriptContent);
      hideElement(this.tabVideoContent);
      this.modeTranscriptTab.classList.add("border-b-2", "border-indigo-600", "text-indigo-600");
      this.modeTranscriptTab.classList.remove("text-gray-500");
      this.modeVideoTab.classList.remove("border-b-2", "border-indigo-600", "text-indigo-600");
      this.modeVideoTab.classList.add("text-gray-500");
    } else {
      hideElement(this.tabTranscriptContent);
      showElement(this.tabVideoContent);
      this.modeVideoTab.classList.add("border-b-2", "border-indigo-600", "text-indigo-600");
      this.modeVideoTab.classList.remove("text-gray-500");
      this.modeTranscriptTab.classList.remove("border-b-2", "border-indigo-600", "text-indigo-600");
      this.modeTranscriptTab.classList.add("text-gray-500");
    }
  }

  handleVideoSelect(file) {
    const allowedTypes = ["video/mp4", "video/quicktime", "video/webm"];
    if (!allowedTypes.includes(file.type)) {
      displayError(
        this.errorDiv,
        this.errorMessage,
        "Ungültiges Format. Erlaubt sind: MP4, MOV, WebM."
      );
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      displayError(
        this.errorDiv,
        this.errorMessage,
        "Die Datei ist zu groß. Maximal 100 MB erlaubt."
      );
      return;
    }

    this.videoFile = file;
    this.videoPreview.src = URL.createObjectURL(file);
    showElement(this.videoPreviewContainer);
    hideElement(this.videoDropzone);
    this.videoGenerateBtn.disabled = false;
    hideError(this.errorDiv);
  }

  removeVideo() {
    if (this.videoPreview.src) {
      URL.revokeObjectURL(this.videoPreview.src);
    }
    this.videoFile = null;
    this.videoBase64 = null;
    this.videoPreview.src = "";
    hideElement(this.videoPreviewContainer);
    showElement(this.videoDropzone);
    this.videoGenerateBtn.disabled = true;
    this.videoFileInput.value = "";
    hideElement(this.platformApproval);
    hideElement(this.videoProgress);
  }

  setProgressStep(step) {
    const steps = [this.progressTranscript, this.progressKeywords, this.progressContent];
    steps.forEach((s, i) => {
      if (i < step) {
        s.classList.remove("text-gray-400");
        s.classList.add("text-green-600");
      } else if (i === step) {
        s.classList.remove("text-gray-400");
        s.classList.add("text-indigo-600");
      } else {
        s.classList.remove("text-green-600", "text-indigo-600");
        s.classList.add("text-gray-400");
      }
    });
  }

  async handleGenerate() {
    if (!this.videoFile) return;

    this.videoGenerateBtn.disabled = true;
    showElement(this.videoProgress);
    hideElement(this.platformApproval);
    hideError(this.errorDiv);
    this.approvedPlatforms.clear();
    this.updateSendButton();

    try {
      this.setProgressStep(0);

      const formData = new FormData();
      formData.append("video", this.videoFile);

      const response = await fetch("/api/generate-from-video", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Fehler bei der Video-Verarbeitung.");
      }

      this.setProgressStep(2);
      const data = await response.json();
      this.generatedData = data;

      // Store video as base64 for n8n
      const reader = new FileReader();
      reader.onload = () => {
        this.videoBase64 = reader.result.split(",")[1];
      };
      reader.readAsDataURL(this.videoFile);

      // Display results
      this.displayPlatformResults(data);
      this.setProgressStep(3);
      showElement(this.platformApproval);
    } catch (error) {
      displayError(this.errorDiv, this.errorMessage, error.message);
      console.error("Video generation error:", error);
    } finally {
      this.videoGenerateBtn.disabled = false;
    }
  }

  displayPlatformResults(data) {
    const platforms = data.platforms;

    // YouTube
    if (platforms.youtube) {
      setTextContent(getElement("approval-yt-title"), platforms.youtube.title || "");
      setTextContent(getElement("approval-yt-description"), platforms.youtube.description || "");
    }

    // LinkedIn
    if (platforms.linkedin) {
      setTextContent(getElement("approval-li-post"), platforms.linkedin.linkedinPost || "");
    }

    // Instagram
    if (platforms.instagram) {
      setTextContent(getElement("approval-ig-post"), platforms.instagram.instagramPost || "");
    }

    // TikTok
    if (platforms.tiktok) {
      setTextContent(getElement("approval-tt-post"), platforms.tiktok.tiktokPost || "");
    }

    // Reset all approval states
    document.querySelectorAll(".approve-btn").forEach((btn) => {
      btn.textContent = "Freigeben";
      btn.classList.remove("bg-gray-400");
      btn.classList.add("bg-green-600");
    });
  }

  approvePlatform(platform) {
    this.approvedPlatforms.add(platform);
    const btn = document.querySelector(`.approve-btn[data-platform="${platform}"]`);
    if (btn) {
      btn.textContent = "Freigegeben";
      btn.classList.remove("bg-green-600");
      btn.classList.add("bg-gray-400");
    }
    this.updateSendButton();
  }

  async regeneratePlatform(platform) {
    if (!this.generatedData) return;

    this.approvedPlatforms.delete(platform);
    this.updateSendButton();

    const card = getElement(`approval-${platform}`);
    card.classList.add("opacity-50");

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: this.generatedData.transcript,
          type: platform,
          keywords: this.generatedData.keywords,
        }),
      });

      if (!response.ok) {
        throw new Error("Regenerierung fehlgeschlagen.");
      }

      const data = await response.json();
      this.generatedData.platforms[platform] = { ...data, modelUsed: data.modelUsed };

      // Update the card content
      this.displaySinglePlatformResult(platform, data);
    } catch (error) {
      displayError(this.errorDiv, this.errorMessage, error.message);
    } finally {
      card.classList.remove("opacity-50");
    }
  }

  displaySinglePlatformResult(platform, data) {
    switch (platform) {
      case "youtube":
        setTextContent(getElement("approval-yt-title"), data.title || "");
        setTextContent(getElement("approval-yt-description"), data.description || "");
        break;
      case "linkedin":
        setTextContent(getElement("approval-li-post"), data.linkedinPost || "");
        break;
      case "instagram":
        setTextContent(getElement("approval-ig-post"), data.instagramPost || "");
        break;
      case "tiktok":
        setTextContent(getElement("approval-tt-post"), data.tiktokPost || "");
        break;
    }

    // Reset approve button
    const btn = document.querySelector(`.approve-btn[data-platform="${platform}"]`);
    if (btn) {
      btn.textContent = "Freigeben";
      btn.classList.remove("bg-gray-400");
      btn.classList.add("bg-green-600");
    }
  }

  updateSendButton() {
    this.sendToN8nBtn.disabled = this.approvedPlatforms.size === 0;
  }

  async sendToN8n() {
    if (!this.generatedData || this.approvedPlatforms.size === 0) return;

    this.sendToN8nBtn.disabled = true;
    setTextContent(this.sendToN8nBtn, "Wird gesendet...");

    try {
      const approvedData = {};
      for (const platform of this.approvedPlatforms) {
        approvedData[platform] = this.generatedData.platforms[platform];
      }

      const response = await fetch("/api/send-to-n8n", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platforms: approvedData,
          video: this.videoBase64,
          transcript: this.generatedData.transcript,
          keywords: this.generatedData.keywords,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Fehler beim Senden an n8n.");
      }

      setTextContent(this.sendToN8nBtn, "Erfolgreich gesendet!");
      setTimeout(() => {
        setTextContent(this.sendToN8nBtn, "Freigegebene an n8n senden");
        this.sendToN8nBtn.disabled = false;
      }, 3000);
    } catch (error) {
      displayError(this.errorDiv, this.errorMessage, error.message);
      setTextContent(this.sendToN8nBtn, "Freigegebene an n8n senden");
      this.sendToN8nBtn.disabled = false;
    }
  }
}
