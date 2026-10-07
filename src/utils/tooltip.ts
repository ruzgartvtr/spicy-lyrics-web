const emptyTooltip = {
  setContent(_content?: unknown) {},
  destroy() {},
  setProps(_props?: unknown) {},
  popper: null as HTMLElement | null,
};

export function createTooltip(target: Element, props: Record<string, unknown>) {
  const tippyFactory = (globalThis as any).Spicetify?.Tippy;
  if (typeof tippyFactory !== "function") return emptyTooltip;
  const tooltip = tippyFactory(target, props);
  if (!tooltip) return emptyTooltip;
  tooltip.popper?.classList?.add("SpicyLyrics_Tooltip");
  return tooltip;
}
