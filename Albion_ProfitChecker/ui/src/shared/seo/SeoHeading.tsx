import type { ReactNode } from "react";

type SeoHeadingProps = {
  title: string;
  children?: ReactNode;
};

/**
 * Visually-hidden but crawler-visible page heading + intro.
 * Gives each tool page a unique, keyword-relevant <h1> and descriptive text for
 * search engines and JS-rendering crawlers without altering the visible UI.
 */
export function SeoHeading({ title, children }: SeoHeadingProps) {
  return (
    <div className="sr-only">
      <h1>{title}</h1>
      {children ? <p>{children}</p> : null}
    </div>
  );
}
