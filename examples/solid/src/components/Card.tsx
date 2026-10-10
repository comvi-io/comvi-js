import { Show, type ParentProps } from "solid-js";

export function Card(props: ParentProps<{ title: string; body?: string }>) {
  return (
    <section class="card">
      <h2 class="eyebrow">{props.title}</h2>
      <Show when={props.body}>
        <p class="card-body">{props.body}</p>
      </Show>
      {props.children}
    </section>
  );
}
