import { afterEach } from "vitest";
import { enableAutoUnmount } from "@vue/test-utils";

// Every mounted wrapper keeps its effect scope and its i18n event
// subscriptions alive until it is unmounted; without this, a file's wrappers
// all stay subscribed to every instance for the whole file.
enableAutoUnmount(afterEach);
