import { SelectViewport as RekaSelectViewport } from "reka-ui";
import { defineComponent, isVNode, type SetupContext, type VNode } from "vue";

type RenderFunction = (...args: unknown[]) => VNode;

const reka = RekaSelectViewport as unknown as {
  props: Record<string, object>;
  setup: (props: Record<string, unknown>, context: SetupContext) => RenderFunction;
};

/**
 * reka-ui's `SelectViewport` without the inline `<style>` it renders next to
 * the viewport. That element has no nonce here, so a site with a strict
 * `style-src` blocks it and reports a violation every time the dropdown opens.
 * The rules it carried live in `assets/index.css`, which reaches the shadow
 * root as a constructable stylesheet.
 *
 * reka offers no prop for this, so its own setup runs unchanged — the viewport
 * still registers with the select content, which the scroll buttons need —
 * and only the `<style>` vnode is dropped from what it renders.
 */
export default defineComponent({
  name: "SelectViewport",
  inheritAttrs: false,
  props: reka.props,
  setup(props, context) {
    const render = reka.setup(props, context);
    return (...args: unknown[]) => {
      const rendered = render(...args);
      const children = Array.isArray(rendered.children) ? rendered.children : [];
      const kept = children.filter((child) => !(isVNode(child) && child.props?.as === "style"));
      return kept.length === 1 && isVNode(kept[0]) ? kept[0] : rendered;
    };
  },
});
