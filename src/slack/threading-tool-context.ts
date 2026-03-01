// Stub: channel removed during ANIMA v2 rebranding
export function buildSlackThreadingToolContext(params: any): any {
  return {
    currentChannelId: params?.context?.To?.trim() || undefined,
    currentThreadTs: params?.context?.ReplyToId,
    hasRepliedRef: params?.hasRepliedRef,
  };
}
