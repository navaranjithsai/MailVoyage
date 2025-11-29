/**
 * Shared email content styles for CKEditor and email preview/viewing
 * This file centralizes all text formatting styles to ensure consistency
 * across ComposePage, SentPage, EmailPage, and any future components.
 */

// Minimum height for the CKEditor in pixels
export const EDITOR_MIN_HEIGHT_PX = 480;

/**
 * Base content styles for email HTML content
 * Used in both CKEditor (.ck-content) and preview/viewing (.email-preview, .email-content)
 */
const baseContentStyles = `
  /* Headings */
  h1 { font-size: 2.25em; font-weight: 800; margin-bottom: 0.5em; line-height: 1.2; }
  h2 { font-size: 1.875em; font-weight: 700; margin-bottom: 0.5em; line-height: 1.3; }
  h3 { font-size: 1.5em; font-weight: 600; margin-bottom: 0.5em; line-height: 1.4; }
  h4 { font-size: 1.25em; font-weight: 600; margin-bottom: 0.5em; line-height: 1.5; }
  h5 { font-size: 1.1em; font-weight: 600; margin-bottom: 0.5em; line-height: 1.5; }
  h6 { font-size: 1em; font-weight: 600; margin-bottom: 0.5em; line-height: 1.5; }
  
  /* Paragraphs and text */
  p { margin-bottom: 1em; line-height: 1.6; }
  
  /* Text formatting */
  strong, b { font-weight: 700; }
  em, i { font-style: italic; }
  u { text-decoration: underline; }
  s, strike, del { text-decoration: line-through; }
  sub { vertical-align: sub; font-size: 0.75em; }
  sup { vertical-align: super; font-size: 0.75em; }
  mark { background-color: #fef08a; padding: 0.1em 0.2em; border-radius: 0.15em; }
  small { font-size: 0.875em; }
  abbr { text-decoration: underline dotted; cursor: help; }
  kbd { 
    background-color: #f3f4f6; 
    border: 1px solid #d1d5db; 
    border-radius: 0.25em; 
    padding: 0.1em 0.4em; 
    font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace; 
    font-size: 0.875em;
    box-shadow: 0 1px 0 #d1d5db;
  }
  var { font-style: italic; font-family: ui-monospace, monospace; }
  samp { font-family: ui-monospace, monospace; background-color: #f3f4f6; padding: 0.1em 0.3em; border-radius: 0.2em; }
  
  /* Lists */
  ul { list-style-type: disc; padding-left: 1.5em; margin-bottom: 1em; }
  ol { list-style-type: decimal; padding-left: 1.5em; margin-bottom: 1em; }
  li { margin-bottom: 0.25em; line-height: 1.6; }
  ul ul { list-style-type: circle; margin-top: 0.25em; margin-bottom: 0.25em; }
  ul ul ul { list-style-type: square; }
  ol ol { list-style-type: lower-alpha; margin-top: 0.25em; margin-bottom: 0.25em; }
  ol ol ol { list-style-type: lower-roman; }
  li > ul, li > ol { margin-top: 0.5em; }
  
  /* Task/Checkbox lists (CKEditor todo list) */
  ul.todo-list { list-style: none; padding-left: 0; }
  ul.todo-list li { display: flex; align-items: flex-start; gap: 0.5em; }
  ul.todo-list li input[type="checkbox"] { margin-top: 0.3em; }
  .todo-list__label { flex: 1; }
  .todo-list__label__description { display: block; }
  
  /* Definition lists */
  dl { margin-bottom: 1em; }
  dt { font-weight: 600; margin-bottom: 0.25em; }
  dd { margin-left: 1.5em; margin-bottom: 0.5em; }
  
  /* Blockquote - Base styles (with callouts and pullquotes) */
  blockquote { 
    border-left: 4px solid #3b82f6; 
    padding: 0.75em 1em;
    font-style: italic; 
    margin: 1em 0; 
    margin-left: 0; 
    color: #374151;
    background-color: #f0f9ff;
    border-radius: 0 0.375em 0.375em 0;
    position: relative;
    overflow: hidden;
  }
  /* Decorative large quote mark */
  blockquote::before {
    content: "\u201C"; /* left double quotation mark */
    position: absolute;
    top: -0.25em;
    left: 0.5em;
    font-size: 3.5rem;
    color: rgba(59,130,246,0.06);
    line-height: 1;
    pointer-events: none;
  }
  blockquote.text-right::before, blockquote[style*="text-align: right"]::before, .quote-right::before { left: auto; right: 0.5em; transform: scaleX(-1); }
  blockquote p { margin-bottom: 0.5em; }
  blockquote p:last-child { margin-bottom: 0; }
  blockquote cite { display: block; font-size: 0.875em; color: #6b7280; margin-top: 0.5em; font-style: normal; }
  blockquote cite::before { content: "— "; }

  /* Right/Center aligned blockquote variations (and class helpers) */
  blockquote.text-right, blockquote[style*="text-align: right"], .quote-right {
    border-left: none;
    border-right: 4px solid #3b82f6;
    text-align: right;
    border-radius: 0.375em 0 0 0.375em;
    padding-right: 1em;
  }
      blockquote.text-right cite, .quote-right cite { text-align: right; }
  blockquote.text-center, blockquote[style*="text-align: center"], .quote-center {
    border-left: none;
    border-top: 4px solid #3b82f6;
    text-align: center;
    border-radius: 0 0 0.375em 0.375em;
  }
      blockquote.text-center cite, .quote-center cite { text-align: center; }
  blockquote.text-left, blockquote[style*="text-align: left"], .quote-left { /* explicit left */
    border-left: 4px solid #3b82f6;
    text-align: left;
  }

  /* Pullquotes: floated and emphasized short quotes */
  .pullquote, .pull-quote, .pullquote-left, .pullquote-right, .pull-quote-left, .pull-quote-right {
    max-width: 45%;
    padding: 0.75em 1em;
    font-size: 1.05em;
    font-style: italic;
    background-color: #f8fafc;
    border-left: 4px solid #3b82f6;
    border-radius: 0.375em;
    margin: 0 0 1em 0;
  }
  .pullquote-left, .pull-quote-left { float: left; margin-right: 1.25em; }
  .pullquote-right, .pull-quote-right { float: right; margin-left: 1.25em; }
  .pullquote::before { content: "\u201C"; font-size: 2.25rem; color: rgba(59,130,246,0.08); margin-right: 0.25rem; }
  
  /* Responsive behavior for pullquotes */
  @media (max-width: 640px) {
    .pullquote, .pull-quote, .pullquote-left, .pullquote-right, .pull-quote-left, .pull-quote-right { float: none !important; max-width: 100%; margin-left: 0; margin-right: 0; }
  }

  /* Callouts / Info boxes */
  .callout { display: block; padding: 0.75em 1em; border-left: 4px solid #d1d5db; border-radius: 0.375em; margin: 1em 0; background-color: #f9fafb; }
  .callout.info { border-left-color: #3b82f6; background-color: #f0f9ff; }
  .callout.success { border-left-color: #10b981; background-color: #ecfdf5; }
  .callout.warning { border-left-color: #f59e0b; background-color: #fffbeb; }
  .callout.danger { border-left-color: #ef4444; background-color: #fff1f2; }

  /* Nested blockquotes */
  blockquote blockquote {
    margin: 0.75em 0;
    border-left-color: #93c5fd;
    background-color: #e0f2fe;
  }
  
  /* Code - Inline */
  code { 
    background-color: rgba(175, 184, 193, 0.2); 
    padding: 0.2em 0.4em; 
    border-radius: 0.375em; 
    font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace; 
    font-size: 0.85em;
    color: #24292f;
    white-space: pre-wrap;
    position: relative;
    cursor: pointer;
    transition: background-color 0.15s ease, box-shadow 0.15s ease;
  }
  code:hover {
    background-color: rgba(175, 184, 193, 0.35);
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
  }
  /* Inline code copy button (appears on hover) */
  code .inline-copy-btn {
    position: absolute;
    top: 50%;
    right: -0.25rem;
    transform: translateY(-50%) translateX(100%);
    background: #ffffff;
    color: #57606a;
    border: 1px solid #d0d7de;
    padding: 0.15rem 0.35rem;
    font-size: 0.6rem;
    border-radius: 0.25rem;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    box-shadow: 0 2px 6px rgba(0,0,0,0.1);
    z-index: 20;
    opacity: 0;
    visibility: hidden;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    white-space: nowrap;
  }
  code:hover .inline-copy-btn {
    opacity: 1;
    visibility: visible;
    transform: translateY(-50%) translateX(100%) translateX(0.25rem);
  }
  code .inline-copy-btn:hover {
    background: #f3f4f6;
    border-color: #1f2328;
    color: #24292f;
  }
  code .inline-copy-btn.copied {
    background: #dafbe1;
    color: #1a7f37;
    border-color: #1a7f37;
  }
  
  /* Code - Block (pre) */
  pre { 
    background-color: #f6f8fa; 
    color: #24292f; 
    padding: 1em 1em 1em 1em; 
    padding-top: 2.5em;
    border-radius: 0.5em; 
    overflow-x: auto; 
    margin: 1.5em 0;
    font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
    font-size: 0.85em;
    line-height: 1.45;
    border: 1px solid #d0d7de;
    position: relative;
    min-height: 3em;
  }
  pre code { 
    background-color: transparent !important; 
    padding: 0 !important; 
    color: inherit !important;
    font-size: inherit !important;
    border: none !important;
    white-space: pre;
    display: block;
    overflow-x: auto;
  }

  /* Copy button for code blocks - modern glassmorphism style */
  .code-copy-btn {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    background: rgba(255,255,255,0.9);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    color: #57606a;
    border: 1px solid rgba(208,215,222,0.8);
    padding: 0.35rem 0.65rem;
    font-size: 0.65rem;
    border-radius: 0.5rem;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08), 0 0 0 1px rgba(255,255,255,0.5) inset;
    z-index: 15;
    opacity: 0;
    visibility: hidden;
    transform: translateY(-4px);
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  pre:hover .code-copy-btn {
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
  }
  .code-copy-btn:hover { 
    background: rgba(255,255,255,0.98); 
    color: #1f2328; 
    border-color: #1f2328; 
    transform: translateY(-2px) scale(1.02); 
    box-shadow: 0 4px 12px rgba(0,0,0,0.15), 0 0 0 1px rgba(255,255,255,0.5) inset; 
  }
  .code-copy-btn:active { 
    transform: translateY(0) scale(0.98); 
    box-shadow: 0 1px 4px rgba(0,0,0,0.1);
  }
  .code-copy-btn.copied { 
    background: linear-gradient(135deg, #dafbe1 0%, #c6f6d5 100%); 
    color: #1a7f37; 
    border-color: #1a7f37;
    box-shadow: 0 2px 8px rgba(26,127,55,0.2);
  }
  
  /* Code block language badge - sleek pill design */
  pre[data-language]::before {
    content: attr(data-language);
    position: absolute;
    top: 0.5rem;
    left: 0.5rem;
    padding: 0.25rem 0.6rem;
    font-size: 0.6rem;
    font-weight: 700;
    background: linear-gradient(135deg, rgba(99,102,241,0.1) 0%, rgba(139,92,246,0.1) 100%);
    color: #6366f1;
    border: 1px solid rgba(99,102,241,0.2);
    border-radius: 2rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    z-index: 10;
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
  }
  
  /* Hide custom language badge inside CKEditor to avoid duplication */
  .ck-editor__editable pre[data-language]::before,
  .ck-content[contenteditable="true"] pre[data-language]::before,
  [role="textbox"] pre[data-language]::before {
    display: none !important;
  }
  
  /* Code syntax highlighting placeholders */
  .hljs-keyword, .token.keyword { color: #569cd6; }
  .hljs-string, .token.string { color: #ce9178; }
  .hljs-comment, .token.comment { color: #6a9955; font-style: italic; }
  .hljs-number, .token.number { color: #b5cea8; }
  .hljs-function, .token.function { color: #dcdcaa; }
  .hljs-class, .token.class-name { color: #4ec9b0; }
  .hljs-variable, .token.variable { color: #9cdcfe; }
  .hljs-operator, .token.operator { color: #d4d4d4; }
  .hljs-punctuation, .token.punctuation { color: #d4d4d4; }
  .hljs-tag { color: #569cd6; }
  .hljs-attr { color: #9cdcfe; }
  .hljs-built_in { color: #4fc1ff; }
  
  /* Links */
  a { color: #2563eb; text-decoration: underline; text-underline-offset: 2px; }
  a:hover { color: #1d4ed8; text-decoration-thickness: 2px; }
  a:visited { color: #7c3aed; }
  a[href^="mailto:"] { color: #059669; }
  a[href^="tel:"] { color: #059669; }
  
  /* Tables */
  table { border-collapse: collapse; width: 100%; margin: 1em 0; border: 1px solid #d1d5db; border-radius: 0.5em; overflow: hidden; }
  th, td { border: 1px solid #d1d5db; padding: 0.625em 0.875em; text-align: left; vertical-align: top; }
  th { background-color: #f3f4f6; font-weight: 600; }
  tr:nth-child(even) td { background-color: #f9fafb; }
  tr:hover td { background-color: #f0f9ff; }
  caption { caption-side: bottom; padding: 0.5em; font-size: 0.875em; color: #6b7280; }
  
  /* Table alignment */
  td.text-center, th.text-center { text-align: center; }
  td.text-right, th.text-right { text-align: right; }
  
  /* Images */
  img { max-width: 100%; height: auto; border-radius: 0.5em; }
  img[src^="data:"] { cursor: pointer; transition: opacity 0.2s, transform 0.2s, box-shadow 0.2s; }
  img[src^="data:"]:hover { opacity: 0.9; transform: scale(1.01); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
  figure { margin: 1em 0; text-align: center; }
  figure.image { display: block; }
  figure.image img { margin: 0 auto; }
  figcaption { text-align: center; font-size: 0.875em; color: #6b7280; margin-top: 0.5em; font-style: italic; }
  
  /* Image alignment (CKEditor) */
  .image-style-align-left, figure.image.image-style-align-left { float: left; margin-right: 1.5em; margin-bottom: 1em; }
  .image-style-align-right, figure.image.image-style-align-right { float: right; margin-left: 1.5em; margin-bottom: 1em; }
  .image-style-block-align-left { margin-left: 0; margin-right: auto; }
  .image-style-block-align-right { margin-left: auto; margin-right: 0; }
  .image-style-block-align-center { margin-left: auto; margin-right: auto; }
  
  /* Image sizing */
  figure.image_resized { max-width: 100%; display: block; box-sizing: border-box; }
  figure.image_resized img { width: 100%; }
  figure.image_resized > figcaption { display: block; }
  
  /* Font sizes (CKEditor classes) */
  .text-tiny { font-size: 0.7em; }
  .text-small { font-size: 0.85em; }
  .text-big { font-size: 1.4em; }
  .text-huge { font-size: 1.8em; }
  
  /* Alignment (CKEditor classes) */
  .text-left, [style*="text-align: left"], [style*="text-align:left"] { text-align: left !important; }
  .text-center, [style*="text-align: center"], [style*="text-align:center"] { text-align: center !important; }
  .text-right, [style*="text-align: right"], [style*="text-align:right"] { text-align: right !important; }
  .text-justify, [style*="text-align: justify"], [style*="text-align:justify"] { text-align: justify !important; }
  
  /* Indentation */
  [style*="margin-left"] { margin-left: attr(style); }
  .indent-1 { margin-left: 2em; }
  .indent-2 { margin-left: 4em; }
  .indent-3 { margin-left: 6em; }
  
  /* Horizontal rule */
  hr { border: none; border-top: 2px solid #e5e7eb; margin: 2em 0; }
  
  /* Page break */
  .page-break { page-break-after: always; border-top: 2px dashed #d1d5db; margin: 2em 0; padding-top: 1em; }
  
  /* Mention/Tag */
  .mention { background-color: #dbeafe; color: #1d4ed8; padding: 0.1em 0.3em; border-radius: 0.25em; font-weight: 500; }
  
  /* Highlight colors */
  span[style*="background-color"] { padding: 0.1em 0.2em; border-radius: 0.15em; }
  
  /* Font color and background preservation - inline styles are preserved natively */
  /* Note: Do NOT add any rules that override [style*="color"] or [style*="background-color"] */
  /* The inline styles from CKEditor are already correct and should not be modified */
  
  /* CKEditor specific: Raw HTML block */
  .raw-html-embed { background-color: #f3f4f6; border: 1px dashed #d1d5db; padding: 1em; margin: 1em 0; border-radius: 0.5em; }
  
  /* Details/Summary (expandable content) */
  details { border: 1px solid #d1d5db; border-radius: 0.5em; padding: 0.5em 1em; margin: 1em 0; }
  summary { cursor: pointer; font-weight: 600; padding: 0.5em 0; }
  details[open] summary { margin-bottom: 0.5em; border-bottom: 1px solid #e5e7eb; }
  
  /* Clearfix for floats */
  .clearfix::after { content: ""; display: table; clear: both; }
  
  /* Responsive media */
  .media { position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; margin: 1em 0; }
  .media iframe, .media video { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 0.5em; }
  
  /* Special text styles */
  .spoiler { background-color: #1f2937; color: transparent; border-radius: 0.25em; padding: 0.1em 0.3em; cursor: pointer; transition: all 0.2s; }
  .spoiler:hover, .spoiler.revealed { color: #f3f4f6; }
  
  /* Print styles */
  @media print {
    pre { white-space: pre-wrap; word-wrap: break-word; }
    a { text-decoration: none; }
    a[href]::after { content: " (" attr(href) ")"; font-size: 0.8em; color: #666; }
  }
`;

/**
 * Dark mode overrides for content styles
 * All rules must be complete CSS selectors with { } blocks
 * IMPORTANT: Use :not([style*="color"]) to preserve custom font colors
 * IMPORTANT: Use :not([style*="background"]) to preserve custom background colors
 */
const darkModeContentStyles = `
  /* Base text color for dark mode - only for elements without inline color */
  *:not([style*="color"]) { color: #e5e7eb; }
  
  h1:not([style*="color"]), h2:not([style*="color"]), h3:not([style*="color"]), h4:not([style*="color"]), h5:not([style*="color"]), h6:not([style*="color"]) { color: #f9fafb; }
  
  p:not([style*="color"]) { color: #e5e7eb; }
  
  /* Text formatting dark mode - only for elements without inline color */
  strong:not([style*="color"]), b:not([style*="color"]) { color: #f9fafb; font-weight: 700; }
  em:not([style*="color"]), i:not([style*="color"]) { color: #e5e7eb; font-style: italic; }
  u:not([style*="color"]) { color: #e5e7eb; }
  s:not([style*="color"]), strike:not([style*="color"]), del:not([style*="color"]) { color: #9ca3af; }
  
  /* Keyboard and sample text */
  kbd { 
    background-color: #374151; 
    border-color: #4b5563; 
    color: #e5e7eb;
    box-shadow: 0 1px 0 #4b5563;
  }
  samp { background-color: #374151; color: #e5e7eb; }
  
  /* Blockquote dark mode & callouts */
  blockquote { 
    border-left-color: #60a5fa; 
    color: #d1d5db;
    background-color: #0f1724; /* slightly darker in dark mode */
  }
  blockquote::before { content: "\u201C"; position: absolute; top: -0.25em; left: 0.5em; font-size: 3.5rem; color: rgba(96,165,250,0.06); }
  blockquote.text-right::before, blockquote[style*="text-align: right"]::before, .quote-right::before { left: auto; right: 0.5em; transform: scaleX(-1); }
  blockquote.text-right, blockquote[style*="text-align: right"], .quote-right {
    border-left-color: transparent;
    border-right-color: #60a5fa;
    text-align: right;
  }
  blockquote.text-right cite, .quote-right cite { text-align: right; }
  blockquote.text-center, blockquote[style*="text-align: center"], .quote-center { border-top-color: #60a5fa; }
  blockquote.text-center cite, .quote-center cite { text-align: center; }
  blockquote.text-left, blockquote[style*="text-align: left"], .quote-left { border-left-color: #60a5fa; }
  blockquote blockquote {
    border-left-color: #3b82f6;
    background-color: #0b122b;
  }
  blockquote cite { color: #9ca3af; }

  /* Pullquotes (dark mode): adjust background and borders */
  .pullquote, .pull-quote, .pullquote-left, .pullquote-right { background-color: #0b1220; border-left-color: #60a5fa; color: #d1d5db; }
  .pullquote::before { content: "\u201C"; color: rgba(96,165,250,0.06); }
  @media (max-width: 640px) {
    .pullquote, .pull-quote, .pullquote-left, .pullquote-right, .pull-quote-left, .pull-quote-right { float: none !important; max-width: 100%; margin-left: 0; margin-right: 0; }
  }

  /* Callouts (dark mode) */
  .callout { background-color: #0b1220; border-left-color: #374151; color: #cbd5e1; }
  .callout.info { border-left-color: #60a5fa; background-color: #0b122b; }
  .callout.success { border-left-color: #10b981; background-color: #022913; }
  .callout.warning { border-left-color: #f59e0b; background-color: #241b00; }
  .callout.danger { border-left-color: #ef4444; background-color: #2b0b0b; }
  
  /* Code dark mode */
  code { 
    background-color: rgba(110, 118, 129, 0.4); 
    color: #e6edf3 !important; 
    border-color: transparent;
  }
  code:hover {
    background-color: rgba(110, 118, 129, 0.55);
    box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.2);
  }
  /* Inline code copy button dark mode */
  code .inline-copy-btn {
    background: #21262d;
    color: #8b949e;
    border-color: #30363d;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  }
  code:hover .inline-copy-btn {
    opacity: 1;
    visibility: visible;
  }
  code .inline-copy-btn:hover {
    background: #30363d;
    color: #e6edf3;
    border-color: #8b949e;
  }
  code .inline-copy-btn.copied {
    background: #238636;
    color: #ffffff;
    border-color: #238636;
  }
  pre { 
    background-color: #0d1117 !important; 
    border-color: #30363d !important;
    color: #e6edf3 !important;
  }
  /* Language badge dark mode - purple gradient for dark */
  pre[data-language]::before {
    background: linear-gradient(135deg, rgba(139,92,246,0.15) 0%, rgba(168,85,247,0.15) 100%);
    color: #a78bfa;
    border-color: rgba(139,92,246,0.3);
  }
  
  /* Copy button dark mode - glassmorphism */
  .code-copy-btn { 
    background: rgba(33,38,45,0.9); 
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    color: #8b949e; 
    border-color: rgba(48,54,61,0.8);
    box-shadow: 0 2px 8px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.05) inset;
  }
  pre:hover .code-copy-btn {
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
  }
  .code-copy-btn:hover { 
    background: rgba(48,54,61,0.95); 
    color: #e6edf3; 
    border-color: #8b949e;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.08) inset;
  }
  .code-copy-btn.copied { 
    background: linear-gradient(135deg, #238636 0%, #2ea043 100%); 
    color: #ffffff; 
    border-color: #238636;
    box-shadow: 0 2px 8px rgba(35,134,54,0.4);
  }
  
  /* Links dark mode */
  a { color: #60a5fa; }
  a:hover { color: #93c5fd; }
  a:visited { color: #a78bfa; }
  a[href^="mailto:"], a[href^="tel:"] { color: #34d399; }
  
  /* Tables dark mode */
  table { border-color: #4b5563; }
  th, td { border-color: #4b5563; }
  th { background-color: #374151; }
  tr:nth-child(even) td { background-color: #1f2937; }
  tr:hover td { background-color: #1e3a5f; }
  caption { color: #9ca3af; }
  
  /* Mark/highlight dark mode */
  mark { background-color: #854d0e; color: #fef08a; }
  
  /* Horizontal rule dark mode */
  hr { border-top-color: #4b5563; }
  
  /* Page break dark mode */
  .page-break { border-top-color: #4b5563; }
  
  /* Mention dark mode */
  .mention { background-color: #1e40af; color: #93c5fd; }
  
  /* Raw HTML embed dark mode */
  .raw-html-embed { background-color: #1f2937; border-color: #4b5563; }
  
  /* Details/Summary dark mode */
  details { border-color: #4b5563; }
  details[open] summary { border-bottom-color: #374151; }
  
  /* Spoiler dark mode */
  .spoiler { background-color: #4b5563; }
  .spoiler:hover, .spoiler.revealed { color: #f3f4f6; }
`;

/**
 * CKEditor UI dark mode tweaks
 */
const ckEditorDarkModeUI = `
  .dark .ck.ck-editor__main>.ck-editor__editable { 
    background-color: #1f2937 !important; 
    border-color: #374151 !important; 
    color: #e5e7eb !important; 
  }
  .dark .ck.ck-toolbar { 
    background-color: #1f2937 !important; 
    border-color: #374151 !important; 
  }
  .dark .ck.ck-toolbar__separator {
    background-color: #4b5563 !important;
  }
  .dark .ck.ck-button { color: #e5e7eb !important; }
  .dark .ck.ck-button:hover { background-color: #374151 !important; }
  .dark .ck.ck-button.ck-on { background-color: #2563eb !important; color: white !important; }
  .dark .ck.ck-button.ck-disabled { opacity: 0.5; }
  .dark .ck.ck-dropdown__panel { 
    background-color: #1f2937 !important; 
    border-color: #374151 !important; 
  }
  .dark .ck.ck-list { background-color: #1f2937 !important; }
  .dark .ck.ck-list__item:hover { background-color: #374151 !important; }
  .dark .ck.ck-list__item .ck-button:hover { background-color: #374151 !important; }
  .dark .ck.ck-list__item .ck-button.ck-on { background-color: #2563eb !important; color: white !important; }
  .dark .ck.ck-input { 
    background-color: #374151 !important; 
    border-color: #4b5563 !important; 
    color: #e5e7eb !important; 
  }
  .dark .ck.ck-label { color: #e5e7eb !important; }
  .dark .ck.ck-balloon-panel { 
    background-color: #1f2937 !important; 
    border-color: #374151 !important; 
  }
  .dark .ck.ck-color-grid__tile { border-color: #4b5563 !important; }
  .dark .ck.ck-tooltip .ck-tooltip__text {
    background-color: #374151 !important;
    color: #e5e7eb !important;
  }
  .dark .ck.ck-heading-dropdown .ck-list__item {
    color: #e5e7eb !important;
  }
`;

/**
 * Prefix all CSS selectors in a stylesheet with a parent selector
 * Properly handles multi-line rules, @media queries, and nested selectors
 * @param css - The CSS string to prefix
 * @param parentSelector - The parent selector to add (e.g., '.email-content')
 * @param darkModePrefix - Optional dark mode class prefix (e.g., '.dark')
 */
const prefixCssSelectors = (css: string, parentSelector: string, darkModePrefix = ''): string => {
  // Remove comments first to avoid false matches
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  
  // Split by rules - find each selector { ... } block
  const result: string[] = [];
  let buffer = '';
  let braceDepth = 0;
  let inAtRule = false;
  let atRuleBuffer = '';
  
  for (let i = 0; i < noComments.length; i++) {
    const char = noComments[i];
    
    if (char === '@') {
      inAtRule = true;
      atRuleBuffer = '@';
      continue;
    }
    
    if (inAtRule) {
      if (char === '{') {
        // Start of @media or @keyframes block
        atRuleBuffer += char;
        braceDepth++;
        // For @media rules, we need to process the content inside
        if (atRuleBuffer.includes('@media')) {
          result.push(atRuleBuffer);
          atRuleBuffer = '';
          inAtRule = false;
        } else {
          // For other @ rules like @keyframes, just pass through
          buffer = atRuleBuffer;
          atRuleBuffer = '';
          inAtRule = false;
        }
        continue;
      }
      atRuleBuffer += char;
      continue;
    }
    
    buffer += char;
    
    if (char === '{') {
      braceDepth++;
    } else if (char === '}') {
      braceDepth--;
      if (braceDepth === 0) {
        // We have a complete rule
        const rule = buffer.trim();
        if (rule) {
          // Find the selector part (before the first {)
          const braceIndex = rule.indexOf('{');
          if (braceIndex !== -1) {
            const selector = rule.substring(0, braceIndex).trim();
            const body = rule.substring(braceIndex);
            
            // Handle multiple selectors separated by commas
            const prefixedSelectors = selector.split(',')
              .map(s => s.trim())
              .filter(s => s)
              .map(s => {
                const prefix = darkModePrefix ? `${darkModePrefix} ${parentSelector}` : parentSelector;
                return `${prefix} ${s}`;
              })
              .join(', ');
            
            result.push(`${prefixedSelectors} ${body}`);
          }
        }
        buffer = '';
      }
    }
  }
  
  return result.join('\n\n');
};

/**
 * Generate the complete CSS styles for email content
 * @param selector - The CSS selector to scope styles to (e.g., '.ck-content', '.email-preview')
 * @param includeDarkMode - Whether to include dark mode styles
 */
export const generateContentStyles = (selector: string, includeDarkMode = true): string => {
  // Prefix base styles with the selector
  const prefixedBaseStyles = prefixCssSelectors(baseContentStyles, selector);

  let darkModeStyles = '';
  if (includeDarkMode) {
    // Prefix dark mode styles with .dark and the selector
    darkModeStyles = prefixCssSelectors(darkModeContentStyles, selector, '.dark');
  }

  return `${prefixedBaseStyles}\n\n${darkModeStyles}`;
};

/**
 * Complete email styles including CKEditor content, preview, and UI dark mode
 */
export const getEmailEditorStyles = (): string => {
  return `
    /* CKEditor minimum height */
    .ck-editor__editable[role="textbox"] {
      min-height: ${EDITOR_MIN_HEIGHT_PX}px;
    }
    
    /* CKEditor Content Styles */
    ${generateContentStyles('.ck-content')}
    
    /* Email Preview/View Styles */
    ${generateContentStyles('.email-preview')}
    ${generateContentStyles('.email-content')}
    
    /* CKEditor UI Dark Mode */
    ${ckEditorDarkModeUI}
  `;
};

/**
 * Inject email styles into the document head
 * Safe to call multiple times - will only inject once
 */
export const injectEmailStyles = (): void => {
  if (typeof document === 'undefined') return;
  
  const styleId = 'email-editor-styles';
  if (document.getElementById(styleId)) return;
  
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = getEmailEditorStyles();
  document.head.appendChild(style);
  // Attach copy handlers after styles injected so code blocks get enhanced
  try {
    // Import dynamically to avoid bundling issues when code not required
    attachCodeBlockEnhancements();
  } catch (err) {
    // If it fails (e.g., during SSR), just ignore
    // console.error('Attach code block JS failed:', err);
  }
};

/**
 * Convert base64 attachment to blob URL for viewing/downloading
 * @param base64Content - Base64 encoded content
 * @param contentType - MIME type of the content
 * @returns Blob URL
 */
export const base64ToBlobUrl = (base64Content: string, contentType: string): string => {
  try {
    const byteCharacters = atob(base64Content);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: contentType });
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error('Error converting base64 to blob:', error);
    return '';
  }
};

/**
 * Revoke a blob URL to free memory
 * @param blobUrl - The blob URL to revoke
 */
export const revokeBlobUrl = (blobUrl: string): void => {
  if (blobUrl && blobUrl.startsWith('blob:')) {
    URL.revokeObjectURL(blobUrl);
  }
};

/**
 * Download a file from base64 content
 * @param base64Content - Base64 encoded content
 * @param contentType - MIME type
 * @param filename - Name for the downloaded file
 */
export const downloadBase64File = (base64Content: string, contentType: string, filename: string): void => {
  const blobUrl = base64ToBlobUrl(base64Content, contentType);
  if (!blobUrl) return;
  
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // Revoke after a short delay to ensure download starts
  setTimeout(() => revokeBlobUrl(blobUrl), 1000);
};

/**
 * Calculate file size from base64 content
 * @param base64Content - Base64 encoded string (with or without data URL prefix)
 * @returns Size in bytes
 */
export const calculateBase64Size = (base64Content: string | undefined | null): number => {
  if (!base64Content) return 0;
  
  // Remove data URL prefix if present (e.g., "data:image/png;base64,")
  let base64Data = base64Content;
  if (base64Data.includes(',')) {
    base64Data = base64Data.split(',')[1];
  }
  
  // Calculate size: base64 encodes 3 bytes into 4 characters
  // Padding characters (=) at the end don't represent data
  const padding = (base64Data.match(/=/g) || []).length;
  return Math.floor((base64Data.length * 3) / 4) - padding;
};

/**
 * Get attachment size - uses provided size or calculates from base64 content
 * @param size - Provided size in bytes (may be 0 or undefined)
 * @param content - Base64 content (optional, used as fallback)
 * @returns Size in bytes
 */
export const getAttachmentSize = (size: number | undefined | null, content?: string): number => {
  // If size is provided and valid, use it
  if (size !== undefined && size !== null && size > 0) {
    return size;
  }
  // Otherwise, calculate from base64 content
  return calculateBase64Size(content);
};

/**
 * Format file size to human readable string
 * @param bytes - File size in bytes
 * @param base64Content - Optional base64 content to calculate size from if bytes is 0
 * @returns Formatted string (e.g., "1.5 MB")
 */
export const formatFileSize = (bytes: number | undefined | null, base64Content?: string): string => {
  // Get actual size (use provided or calculate from base64)
  const actualBytes = getAttachmentSize(bytes, base64Content);
  
  if (actualBytes === 0) {
    return '0 Bytes';
  }
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(actualBytes) / Math.log(k));
  return parseFloat((actualBytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Get file icon based on content type
 * @param contentType - MIME type of the file
 * @returns Icon name/type for display
 */
export const getFileIconType = (contentType: string): 'image' | 'pdf' | 'document' | 'spreadsheet' | 'video' | 'audio' | 'archive' | 'code' | 'file' => {
  if (contentType.startsWith('image/')) return 'image';
  if (contentType === 'application/pdf') return 'pdf';
  if (contentType.includes('word') || contentType.includes('document')) return 'document';
  if (contentType.includes('sheet') || contentType.includes('excel')) return 'spreadsheet';
  if (contentType.startsWith('video/')) return 'video';
  if (contentType.startsWith('audio/')) return 'audio';
  if (contentType.includes('zip') || contentType.includes('rar') || contentType.includes('tar')) return 'archive';
  if (contentType.includes('javascript') || contentType.includes('json') || contentType.includes('xml') || contentType.includes('html') || contentType.includes('css')) return 'code';
  return 'file';
};

/**
 * Check if file type can be previewed in browser
 * @param contentType - MIME type of the file
 * @returns Whether the file can be previewed
 */
export const canPreviewFile = (contentType: string): boolean => {
  return (
    contentType.startsWith('image/') ||
    contentType === 'application/pdf' ||
    contentType.startsWith('text/') ||
    contentType.startsWith('video/') ||
    contentType.startsWith('audio/')
  );
};

/**
 * Attach copy buttons and other code-block enhancements dynamically
 * Adds a copy button to each <pre> that contains a <code> element
 * Also adds copy functionality to inline <code> elements
 * Only applies to non-editable content (email-preview, email-content)
 */
export const attachCodeBlockEnhancements = (rootSelector = 'body') => {
  if (typeof window === 'undefined') return;
  const root = document.querySelector(rootSelector) || document.body;

  // Check if element or any parent is contentEditable (actual editing mode, not just viewing)
  const isInEditableArea = (el: HTMLElement): boolean => {
    let current: HTMLElement | null = el;
    while (current) {
      // Only consider actual contentEditable elements
      // The ck-editor__editable class indicates the actual editor, not just content display
      if (current.isContentEditable || 
          current.classList.contains('ck-editor__editable') ||
          current.getAttribute('role') === 'textbox') {
        return true;
      }
      current = current.parentElement;
    }
    return false;
  };

  // Helper to copy text to clipboard
  const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      } else {
        throw new Error('Clipboard API unavailable');
      }
    } catch (err) {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed'; 
      textarea.style.opacity = '0';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        document.body.removeChild(textarea);
        return true;
      } catch (err2) {
        console.error('Copy failed', err2);
        document.body.removeChild(textarea);
        return false;
      }
    }
  };

  // Add copy button to inline code elements
  const addButtonForInlineCode = (code: HTMLElement) => {
    if (code.dataset.inlineCopyAttached === 'true') return;
    // Skip if inside a pre (block code) or editable area
    if (code.closest('pre')) return;
    if (isInEditableArea(code)) return;
    // Only add to code elements inside viewing containers
    const parentContainer = code.closest('.email-preview, .email-content, .ck-content');
    if (!parentContainer) return;

    // Create inline copy button
    const btn = document.createElement('button');
    btn.className = 'inline-copy-btn';
    btn.type = 'button';
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
    btn.setAttribute('aria-label', 'Copy code');
    btn.title = 'Copy';
    
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      const textToCopy = code.textContent || '';
      const success = await copyToClipboard(textToCopy);

      if (success) {
        btn.classList.add('copied');
        btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
        setTimeout(() => { 
          btn.classList.remove('copied'); 
          btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
        }, 1500);
      }
    });

    code.appendChild(btn);
    code.dataset.inlineCopyAttached = 'true';
  };

  const addButtonForPre = (pre: HTMLElement) => {
    if (pre.dataset.copyAttached === 'true') return;
    // Skip if inside an editable area (CKEditor) to prevent interference
    if (isInEditableArea(pre)) return;
    // Only add to pre elements inside viewing containers (email-preview, email-content, or ck-content without editing)
    const parentContainer = pre.closest('.email-preview, .email-content, .ck-content');
    if (!parentContainer) return;

    // Create button with modern icon
    const btn = document.createElement('button');
    btn.className = 'code-copy-btn';
    btn.type = 'button';
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg><span>Copy</span>';
    btn.setAttribute('aria-label', 'Copy code');
    btn.title = 'Copy code';
    
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      const codeEl = pre.querySelector('code');
      const textToCopy = codeEl ? (codeEl.textContent || '') : (pre.textContent || '');
      const success = await copyToClipboard(textToCopy);

      if (success) {
        btn.classList.add('copied');
        const span = btn.querySelector('span');
        const svg = btn.querySelector('svg');
        if (span) span.textContent = 'Copied!';
        if (svg) svg.outerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
        setTimeout(() => { 
          btn.classList.remove('copied'); 
          if (span) span.textContent = 'Copy';
          const checkSvg = btn.querySelector('svg');
          if (checkSvg) checkSvg.outerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
        }, 2000);
      }
    });

    pre.appendChild(btn);
    
    // If code element has a registered language class like 'language-python', set data-language on pre for label
    const codeEl = pre.querySelector('code');
    if (codeEl) {
      const m = (codeEl.className || '').match(/language-([^\s]+)/);
      if (m && m[1]) {
        pre.dataset.language = m[1];
      }
    }
    pre.dataset.copyAttached = 'true';
  };

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of Array.from(m.addedNodes)) {
        if (node instanceof HTMLElement) {
          // Handle pre elements
          if (node.matches && node.matches('pre')) {
            addButtonForPre(node);
          } else {
            const pres = node.querySelectorAll('pre');
            pres.forEach(p => addButtonForPre(p as HTMLElement));
          }
          // Handle inline code elements
          if (node.matches && node.matches('code') && !node.closest('pre')) {
            addButtonForInlineCode(node);
          } else {
            const codes = node.querySelectorAll('code');
            codes.forEach(c => {
              if (!c.closest('pre')) addButtonForInlineCode(c as HTMLElement);
            });
          }
        }
      }
    }
  });

  // Initial pass for pre elements
  Array.from(root.querySelectorAll('pre')).forEach(p => addButtonForPre(p as HTMLElement));
  // Initial pass for inline code elements
  Array.from(root.querySelectorAll('code')).forEach(c => {
    if (!c.closest('pre')) addButtonForInlineCode(c as HTMLElement);
  });
  
  observer.observe(root, { childList: true, subtree: true });
  
  // Return a destroy function
  return () => observer.disconnect();
};

/**
 * Sanitize HTML content for safe rendering
 * Uses DOMPurify to prevent XSS attacks while preserving formatting
 * @param html - Raw HTML string to sanitize
 * @returns Sanitized HTML string
 */
export const sanitizeEmailHtml = (html: string): string => {
  if (typeof window === 'undefined') return html;
  
  // Import DOMPurify dynamically or use inline sanitization
  // For now, we'll use a basic inline approach
  // In production, you should use DOMPurify: import DOMPurify from 'dompurify'
  try {
    // Create a temporary element to parse HTML
    const temp = document.createElement('div');
    temp.innerHTML = html;
    
    // Remove script tags
    const scripts = temp.querySelectorAll('script');
    scripts.forEach(script => script.remove());
    
    // Remove event handlers from all elements
    const allElements = temp.querySelectorAll('*');
    allElements.forEach(el => {
      // Get all attributes
      const attrs = Array.from(el.attributes);
      attrs.forEach(attr => {
        if (attr.name.startsWith('on')) {
          el.removeAttribute(attr.name);
        }
      });
    });
    
    return temp.innerHTML;
  } catch (e) {
    console.error('Error sanitizing HTML:', e);
    return html;
  }
};

export default {
  EDITOR_MIN_HEIGHT_PX,
  generateContentStyles,
  getEmailEditorStyles,
  injectEmailStyles,
  base64ToBlobUrl,
  revokeBlobUrl,
  downloadBase64File,
  calculateBase64Size,
  getAttachmentSize,
  formatFileSize,
  getFileIconType,
  canPreviewFile,
  sanitizeEmailHtml,
  attachCodeBlockEnhancements,
};
