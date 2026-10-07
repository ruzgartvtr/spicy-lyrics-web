type ModalDisplayOptions = {
	title: string;
	content: any;
	isLarge?: boolean;
	onClose?: (() => void) | null;
	closeBtn?: boolean;
	closeOnOutsideClick?: boolean;
	/** Replaces the default hide() behavior for the close button and outside-click. */
	closeHandler?: (() => void) | null;
	/** Optional class appended to `.sl-modal` for per-modal styling/identification. */
	modalId?: string | null;
};

type ModalTransitionOptions = {
	content: any;
	onClose?: (() => void) | null;
	closeHandler?: (() => void) | null;
	/** Optional class appended to `.sl-modal`. Replaces any previously set modalId class. */
	modalId?: string | null;
	/** Optional new header title. Omit to keep the current one. */
	title?: string | null;
};

/**
 * Modal host. Uses a plain div instead of a custom element so the web content-script
 * world can construct it (HTMLElement subclasses throw Illegal constructor there).
 */
class _HTMLGenericModal {
	private readonly root: HTMLDivElement;
	private _onClose: (() => void) | null;
	private _currentModalId: string | null;

	constructor() {
		this.root = document.createElement("div");
		this.root.classList.add("SpicyLyricsModal");
		this._onClose = null;
		this._currentModalId = null;
	}

	private _applyModalId(modalId: string | null | undefined): void {
		const modalEl = this.root.querySelector(".sl-modal");
		if (this._currentModalId && modalEl) {
			modalEl.classList.remove(this._currentModalId);
		}
		const nextId = typeof modalId === "string" && modalId.length > 0 ? `slmodal-${modalId}` : null;
		if (nextId && modalEl) {
			modalEl.classList.add(nextId);
		}
		this._currentModalId = nextId;
	}

	hide(): void {
		const capturedOnClose = this._onClose;
		this._onClose = null;
		this._currentModalId = null;
		const _removeFromDom = (timeoutDuration: number) => {
			setTimeout(() => {
				this.root.remove();
				if (typeof capturedOnClose === "function") {
					capturedOnClose();
				}
			}, timeoutDuration);
		};

		const genericModal = this.root.querySelector(".sl-modal-overlay-animated");
		if (genericModal) {
			genericModal.classList.remove("Active");
			_removeFromDom(0.22 * 1000 + 30);
		} else {
			_removeFromDom(0);
		}
	}

	/**
	 * Instantly swap modal content without hiding/re-animating.
	 * Use for modal-to-modal transitions where the frame should stay visible.
	 */
	transition({ content, onClose = null, closeHandler = null, modalId = null, title = null }: ModalTransitionOptions): void {
		if (typeof this._onClose === "function") {
			this._onClose();
		}
		this._onClose = onClose;
		const closeButton = this.root.querySelector(".sl-modal-close-btn");
		if (closeButton) {
			(closeButton as HTMLButtonElement).onclick = closeHandler ?? this.hide.bind(this);
		}
		if (typeof title === "string") {
			const titleEl = this.root.querySelector(".sl-modal-title");
			if (titleEl) titleEl.textContent = title;
		}
		this._applyModalId(modalId);
		const main = this.root.querySelector("main");
		if (main) {
			main.innerHTML = "";
			if (typeof content === "string") {
				main.innerHTML = content;
			} else if (content instanceof Node) {
				main.append(content);
			}
		}
	}

	/**
	 * Display the modal.
	 */
	display({
		title,
		content,
		isLarge = false,
		onClose = null,
		closeBtn = true,
		closeOnOutsideClick = true,
		closeHandler = null,
		modalId = null,
	}: ModalDisplayOptions): void {
		if (typeof this._onClose === "function") {
			this._onClose();
		}
		this._onClose = onClose;
		this._currentModalId = null;
		this.root.innerHTML = `
<div class="sl-modal-overlay sl-modal-overlay-animated" style="z-index: 100;">
	<div class="sl-modal" tabindex="-1" role="dialog" aria-label="${title}" aria-modal="true">
		<div class="${isLarge ? "sl-modal-container-large" : "sl-modal-container"}">
			<div class="sl-modal-header">
				<h1 class="sl-modal-title" as="h1">${title}</h1>
				${closeBtn ? '<button aria-label="Close" class="sl-modal-close-btn"><svg width="18" height="18" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><title>Close</title><path d="M31.098 29.794L16.955 15.65 31.097 1.51 29.683.093 15.54 14.237 1.4.094-.016 1.508 14.126 15.65-.016 29.795l1.414 1.414L15.54 17.065l14.144 14.143" fill="currentColor" fill-rule="evenodd"></path></svg></button>' : ""}
			</div>
			<div class="sl-modal-main-section">
				<main class="sl-modal-content"></main>
			</div>
		</div>
	</div>
</div>`;

		const closeButton = this.root.querySelector("button");
		if (closeButton) {
			(closeButton as HTMLButtonElement).onclick = closeHandler ?? this.hide.bind(this);
		}
		this._applyModalId(modalId);
		const main = this.root.querySelector("main");
		const hidePopup = closeHandler ?? this.hide.bind(this);

		const overlay = this.root.querySelector(".sl-modal-overlay");
		if (overlay) {
			overlay.addEventListener("click", (event: MouseEvent) => {
				if (closeOnOutsideClick && event.target === event.currentTarget) hidePopup();
			});
		}

		if (main) {
			if (typeof content === "string") {
				main.innerHTML = content;
			} else if (content instanceof Node) {
				main.append(content);
			} else if (content !== null && content !== undefined) {
				main.append(String(content));
			}
		}
		document.body.append(this.root);

		setTimeout(() => {
			const genericModal = this.root.querySelector(".sl-modal-overlay-animated");
			if (genericModal) genericModal.classList.add("Active");
		}, 50);
	}
}

export const PopupModal = new _HTMLGenericModal();
