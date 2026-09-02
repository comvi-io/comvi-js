// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPopupHarness, type PopupHarness } from "./harness";

/**
 * The popup paints a theme from the OS preference immediately and only then
 * reconciles with the stored choice, so a cold storage read never delays the
 * first frame.
 */
describe("popup theme", () => {
  let popup: PopupHarness;

  beforeEach(() => {
    popup = createPopupHarness();
    popup.setActiveTab(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const isDark = () => document.documentElement.classList.contains("dark");

  it("paints the light theme when the OS prefers light", async () => {
    popup.setSystemDark(false);

    await popup.start();

    expect(isDark()).toBe(false);
  });

  it("paints the dark theme when the OS prefers dark", async () => {
    popup.setSystemDark(true);

    await popup.start();

    expect(isDark()).toBe(true);
  });

  it("falls back to light when the browser has no matchMedia", async () => {
    popup.setSystemDark(null);

    await popup.start();

    expect(isDark()).toBe(false);
  });

  it("shows the moon icon and hides the sun icon in light mode", async () => {
    popup.setSystemDark(false);

    await popup.start();

    expect(popup.themeIconSun.classList.contains("hidden")).toBe(true);
    expect(popup.themeIconMoon.classList.contains("hidden")).toBe(false);
  });

  it("shows the sun icon and hides the moon icon in dark mode", async () => {
    popup.setSystemDark(true);

    await popup.start();

    expect(popup.themeIconSun.classList.contains("hidden")).toBe(false);
    expect(popup.themeIconMoon.classList.contains("hidden")).toBe(true);
  });

  it("prefers the stored dark theme over a light OS preference", async () => {
    popup.setSystemDark(false);
    await popup.seedTheme("dark");

    await popup.start();

    expect(isDark()).toBe(true);
  });

  it("prefers the stored light theme over a dark OS preference", async () => {
    popup.setSystemDark(true);
    await popup.seedTheme("light");

    await popup.start();

    expect(isDark()).toBe(false);
  });

  it("ignores a stored value that is not a known theme", async () => {
    popup.setSystemDark(true);
    await popup.seedTheme("midnight");

    await popup.start();

    expect(isDark()).toBe(true);
  });

  it("keeps the OS theme when storage has no stored choice", async () => {
    popup.setSystemDark(true);

    await popup.start();

    expect(isDark()).toBe(true);
  });

  it("keeps the OS theme when reading storage fails", async () => {
    popup.setSystemDark(true);
    popup.storageGet.mockRejectedValueOnce(new Error("storage unavailable"));

    await popup.start();

    expect(isDark()).toBe(true);
  });

  it("switches to dark when the toggle is clicked in light mode", async () => {
    popup.setSystemDark(false);
    await popup.start();

    popup.themeToggleBtn.click();
    await popup.flush();

    expect(isDark()).toBe(true);
    expect(popup.themeIconSun.classList.contains("hidden")).toBe(false);
  });

  it("switches to light when the toggle is clicked in dark mode", async () => {
    popup.setSystemDark(true);
    await popup.start();

    popup.themeToggleBtn.click();
    await popup.flush();

    expect(isDark()).toBe(false);
    expect(popup.themeIconMoon.classList.contains("hidden")).toBe(false);
  });

  it("restores the toggled theme the next time the popup opens", async () => {
    popup.setSystemDark(false);
    await popup.start();
    popup.themeToggleBtn.click();
    await popup.flush();

    await popup.start();

    expect(isDark()).toBe(true);
  });

  it("restores a theme toggled back to light the next time the popup opens", async () => {
    popup.setSystemDark(true);
    await popup.start();
    popup.themeToggleBtn.click();
    await popup.flush();

    await popup.start();

    expect(isDark()).toBe(false);
  });

  it("does not let a slow stored theme overwrite a choice the user just made", async () => {
    popup.setSystemDark(false);
    await popup.seedTheme("light");
    popup.holdStorageReads();
    await popup.start();

    popup.themeToggleBtn.click();
    await popup.flush();
    await popup.releaseStorageReads();

    expect(isDark()).toBe(true);
  });
});
