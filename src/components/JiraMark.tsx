interface JiraMarkProps {
  className?: string;
}

export function JiraMark({ className = "" }: JiraMarkProps) {
  return (
    <svg
      className={`jira-logo ${className}`.trim()}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M11.53 2c0 2.4 1.97 4.35 4.35 4.35h1.78v1.7c0 2.4 1.94 4.34 4.34 4.35V2.84a.84.84 0 0 0-.84-.84h-9.63ZM6.76 6.8c0 2.4 1.94 4.34 4.34 4.34h1.8v1.72c.01 2.39 1.95 4.33 4.34 4.34V7.63a.83.83 0 0 0-.83-.83H6.76ZM2 11.6c0 2.4 1.95 4.34 4.35 4.34h1.78v1.72c0 2.4 1.94 4.34 4.34 4.34v-9.57a.83.83 0 0 0-.83-.83H2Z"
      />
    </svg>
  );
}
