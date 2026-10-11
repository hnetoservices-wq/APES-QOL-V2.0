# Clickable Chat Links

Enabled by default under **Basic Features**. Web addresses in the native IGM conversation window (private, kingdom and Secret Society chats) become underlined links that open in a new tab. Supports HTTP/HTTPS, `www.` addresses and bare domains, adding HTTPS when no protocol is provided. Existing game links retain their behavior.

New messages, edited message text and older messages loaded while scrolling are processed automatically. Detection is restricted to the native `.igmSystem` conversation surface and skips conversation-list previews, existing links, editable fields, code, scripts and APES controls. Message text, timestamps and surrounding markup are retained. Trailing punctuation stays outside the link; balanced parentheses in URLs are retained. Only HTTP/HTTPS destinations are created, with `noopener noreferrer` on new tabs.

Turning the feature off restores only APES-created links to plain text. Turning it on processes existing conversations again. The feature runs independently of IGM Enhancer and Chat Silencer; it sends no messages and does not request additional permissions.

Run `node tests/chatLinks.cjs` for DOM tests. A live-game check should cover the Gyazo link from the screenshot, new/older messages, toggling the feature, and opening a link without triggering the game's reply action.
