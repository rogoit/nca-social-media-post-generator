import { UI_MESSAGES, ERROR_MESSAGES } from "../config/constants.js";

export function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id) as T;
  if (!element) {
    throw new Error(`Element with id '${id}' not found`);
  }
  return element;
}

export function hideElement(element: HTMLElement): void {
  element.classList.add("hidden");
}

export function showElement(element: HTMLElement): void {
  element.classList.remove("hidden");
}

export function setTextContent(element: HTMLElement, text: string): void {
  element.textContent = text;
}

export function copyToClipboard(contentElement: HTMLElement, buttonElement: HTMLElement): void {
  const content = contentElement.textContent || "";
  const originalText = buttonElement.textContent || "";

  navigator.clipboard
    .writeText(content)
    .then(() => {
      setTextContent(buttonElement, UI_MESSAGES.COPIED);
      setTimeout(() => {
        setTextContent(buttonElement, originalText);
      }, 2000);
    })
    .catch((err) => {
      console.error(ERROR_MESSAGES.COPY_FAILED, err);
    });
}

export function createKeywordTag(
  keyword: string,
  index: number,
  onRemove: (index: number) => void
): HTMLElement {
  const tag = document.createElement("span");
  tag.className =
    "inline-flex items-center px-3 py-1 rounded-full text-sm bg-indigo-100 text-indigo-800";
  tag.innerHTML = `
    ${keyword}
    <button type="button" class="ml-2 text-indigo-600 hover:text-indigo-800 focus:outline-none" data-index="${index}">
      ×
    </button>
  `;

  const removeButton = tag.querySelector("button");
  if (removeButton) {
    removeButton.addEventListener("click", () => onRemove(index));
  }

  return tag;
}

export function clearContainer(container: HTMLElement): void {
  container.innerHTML = "";
}

export function displayError(
  errorDiv: HTMLElement,
  errorMessage: HTMLElement,
  message: string
): void {
  setTextContent(errorMessage, message);
  showElement(errorDiv);
}

export function hideError(errorDiv: HTMLElement): void {
  hideElement(errorDiv);
}
