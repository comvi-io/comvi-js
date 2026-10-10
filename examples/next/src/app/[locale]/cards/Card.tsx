import type { ReactNode } from "react";

/** One feature: its name, a sentence about it, and the live widget. */
export function Card({
  title,
  body,
  children,
}: {
  title: ReactNode;
  body: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card">
      <h2 className="eyebrow">{title}</h2>
      <p className="body">{body}</p>
      {children}
    </section>
  );
}
