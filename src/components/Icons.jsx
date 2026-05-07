// Minimal inline SVG icons. Inline keeps them themeable via currentColor and
// avoids shipping an icon font for ~6 glyphs.

const Svg = ({ children, size = 24, ...rest }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="currentColor"
    {...rest}
  >
    {children}
  </svg>
);

export const Play = props => (
  <Svg {...props}><path d="M8 5v14l11-7z" /></Svg>
);
export const Pause = props => (
  <Svg {...props}><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></Svg>
);
export const Next = props => (
  <Svg {...props}><path d="M6 6v12l8.5-6L6 6zm9 0h2v12h-2z" /></Svg>
);
export const Prev = props => (
  <Svg {...props}><path d="M18 6v12L9.5 12 18 6zM7 6h2v12H7z" /></Svg>
);
export const Down = props => (
  <Svg {...props}><path d="M7 10l5 5 5-5H7z" /></Svg>
);
export const Music = props => (
  <Svg {...props}><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" /></Svg>
);
export const Trash = props => (
  <Svg {...props}><path d="M9 3h6v2h5v2H4V5h5V3zm-3 6h12l-1 12H7L6 9z" /></Svg>
);
export const Upload = props => (
  <Svg {...props}><path d="M5 20h14v-2H5v2zM12 4l-5 5h3v6h4V9h3l-5-5z" /></Svg>
);
