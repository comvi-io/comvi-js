import {
  apiLog,
  closeDialog,
  configureMock,
  contextRequests,
  dialog,
  enable,
  expect,
  field,
  framesIn,
  openEditor,
  openSite,
  platformStore,
  POLL,
  save,
  test,
  typeInto,
  visibleText,
  withGateE,
  type ApiRequest,
} from "./site";

/**
 * The lot's goal on a Comvi 0.8 page: enable the editor → pick a translation → change it →
 * save → see the result, through the real popup, the real proxy and the real editor UI.
 */
test.describe.configure({ timeout: 90_000 });

const saves = (log: ApiRequest[]) =>
  log.filter((entry) => entry.method === "PUT").map((entry) => JSON.parse(entry.body!));

test("edit a plain string: the right key, namespace and locale reach the platform, and the page shows it", async () => {
  await withGateE({}, async (launched, popups) => {
    const { page, tabId } = await openSite(launched, "/app");
    await enable(launched, popups, page, tabId);

    await test.step("the string is marked with its own key and namespace", async () => {
      await expect
        .poll(() => framesIn(page, "#A-title"), POLL)
        .toEqual([{ inst: "", ns: "default", key: "home.title", close: false }]);
      expect(await visibleText(page, "#A-title")).toBe("Welcome home");
    });

    await test.step("the dialog opens on it with the platform's values", async () => {
      await openEditor(page, "#A-title");
      await expect(dialog(page)).toContainText("home.title");
      await expect(field(page, "English")).toHaveValue("Welcome home", POLL);
      await expect(field(page, "German")).toHaveValue("Willkommen");
    });

    await test.step("save sends the key, namespace and locale, and the page shows the new text", async () => {
      await typeInto(page, "English", "Welcome back");
      expect(await save(page)).toContain("Saved");
      expect(saves(await apiLog())).toEqual([
        {
          key: "home.title",
          namespace: "default",
          isPlural: false,
          translations: { en: { value: "Welcome back", status: "not_reviewed" } },
        },
      ]);
      await expect.poll(() => visibleText(page, "#A-title"), POLL).toBe("Welcome back");
      expect((await platformStore()).default["home.title"]).toEqual({
        en: "Welcome back",
        de: "Willkommen",
        "pt-BR": "Bem-vindo",
      });
      await closeDialog(page);
    });

    expect(contextRequests(await apiLog())).toEqual([]);
  });
});

test("a key of another namespace, a nested catalog key, a missing key and rich text are each edited as themselves", async () => {
  await withGateE({}, async (launched, popups) => {
    const { page, tabId } = await openSite(launched, "/app");
    await enable(launched, popups, page, tabId);

    await test.step("the namespace the app asked for: common:save", async () => {
      await expect
        .poll(() => framesIn(page, "#A-common"), POLL)
        .toEqual([{ inst: "", ns: "common", key: "save", close: false }]);
      await openEditor(page, "#A-common");
      await expect(field(page, "English")).toHaveValue("Save", POLL);
      await typeInto(page, "English", "Store it");
      await save(page);
      await expect.poll(() => visibleText(page, "#A-common"), POLL).toBe("Store it");
      await closeDialog(page);
    });

    await test.step("a key of a nested JSON catalog, after normalisation: nav.about", async () => {
      // The catalog is served as { nav: { about: … } }; core flattens it to nav.about.
      expect(await framesIn(page, "#A-nested")).toEqual([
        { inst: "", ns: "default", key: "nav.about", close: false },
      ]);
      await openEditor(page, "#A-nested");
      await expect(field(page, "English")).toHaveValue("About us", POLL);
      await typeInto(page, "English", "About the team");
      await save(page);
      await expect.poll(() => visibleText(page, "#A-nested"), POLL).toBe("About the team");
      await closeDialog(page);
    });

    await test.step("a missing key is marked and created by the save", async () => {
      expect(await framesIn(page, "#A-missing")).toEqual([
        { inst: "", ns: "default", key: "missing.key", close: false },
      ]);
      expect(await visibleText(page, "#A-missing")).toBe("missing.key");
      await openEditor(page, "#A-missing");
      await expect(field(page, "English")).toHaveValue("", POLL);
      await typeInto(page, "English", "Now it exists");
      await save(page);
      await expect.poll(() => visibleText(page, "#A-missing"), POLL).toBe("Now it exists");
      expect((await platformStore()).default["missing.key"]).toEqual({ en: "Now it exists" });
      await closeDialog(page);
    });

    await test.step("rich text is framed as a pair around its parts and edited as ICU source", async () => {
      expect(await framesIn(page, "#A-rich")).toEqual([
        { inst: "", ns: "default", key: "rich.terms", close: false },
        { inst: "", ns: "default", key: "rich.terms", close: true },
      ]);
      expect(await visibleText(page, "#A-rich")).toBe("Read the terms now");
      // A click on the bold part is a click inside the pair.
      await openEditor(page, "#A-rich b");
      await expect(field(page, "English")).toHaveValue("Read the <b>terms</b> now", POLL);
      await typeInto(page, "English", "Please read the <b>new terms</b> today");
      await save(page);
      await expect
        .poll(() => visibleText(page, "#A-rich"), POLL)
        .toBe("Please read the new terms today");
      expect(await page.locator("#A-rich b").textContent()).toBe("new terms");
      await closeDialog(page);
    });

    expect(saves(await apiLog()).map((s) => `${s.namespace}:${s.key}`)).toEqual([
      "common:save",
      "default:nav.about",
      "default:missing.key",
      "default:rich.terms",
    ]);
  });
});

test("a fallback text is edited in the page's locale, and the page then shows that locale's text", async () => {
  await withGateE({}, async (launched, popups) => {
    const { page, tabId } = await openSite(launched, "/app?locale=de");
    await expect.poll(() => visibleText(page, "#A-title"), POLL).toBe("Willkommen");
    // `only.en` has no German message: the page shows the English fallback.
    expect(await visibleText(page, "#A-fallback")).toBe("Only in English");
    await enable(launched, popups, page, tabId);

    await openEditor(page, "#A-fallback");
    await expect(field(page, "English")).toHaveValue("Only in English", POLL);
    await expect(field(page, "German")).toHaveValue("");
    await typeInto(page, "German", "Jetzt auch auf Deutsch");
    await save(page);

    expect(saves(await apiLog())).toEqual([
      expect.objectContaining({
        key: "only.en",
        namespace: "default",
        translations: { de: { value: "Jetzt auch auf Deutsch", status: "not_reviewed" } },
      }),
    ]);
    await expect.poll(() => visibleText(page, "#A-fallback"), POLL).toBe("Jetzt auch auf Deutsch");
    await closeDialog(page);
  });
});

test("an API error is shown to the user, and the retry saves", async () => {
  await withGateE({}, async (launched, popups) => {
    const { page, tabId } = await openSite(launched, "/app");
    await enable(launched, popups, page, tabId);
    await configureMock({ failSaves: 1 });

    await openEditor(page, "#A-title");
    await typeInto(page, "English", "Try again later");
    const failed = await save(page);
    expect(failed).toContain("Error");
    expect(failed).toContain("Failed to save translation");
    // Nothing changed on the page or the platform, and the typed text is still in the form.
    expect(await visibleText(page, "#A-title")).toBe("Welcome home");
    expect((await platformStore()).default["home.title"].en).toBe("Welcome home");
    await expect(field(page, "English")).toHaveValue("Try again later");

    expect(await save(page)).toContain("Saved");
    await expect.poll(() => visibleText(page, "#A-title"), POLL).toBe("Try again later");
    expect((await platformStore()).default["home.title"].en).toBe("Try again later");
    expect(saves(await apiLog())).toHaveLength(2);
    await closeDialog(page);
  });
});

// Owner decision D6: the platform save works for any language; the local add() goes only to a
// catalog that loaded. Saving `de` on an `en` page must not create a one-key `de` catalog that
// would keep core from loading the real one.
test("saving a language whose catalog is not loaded creates no partial catalog; the switch loads the full one", async () => {
  await withGateE({}, async (launched, popups) => {
    const { page, tabId } = await openSite(launched, "/app");
    await enable(launched, popups, page, tabId);
    const catalogs = () =>
      page.evaluate(() => {
        const entry = (globalThis as any).__COMVI__[0];
        const c = entry.x.state().c;
        return { de: c.default?.de ?? null, en: Object.keys(c.default?.en?.m ?? {}).length };
      });
    expect(await catalogs()).toEqual({ de: null, en: 5 });

    await openEditor(page, "#A-title");
    await typeInto(page, "German", "Herzlich willkommen");
    await save(page);
    await closeDialog(page);

    await test.step("the platform has the value, the page has no German catalog", async () => {
      expect((await platformStore()).default["home.title"].de).toBe("Herzlich willkommen");
      expect(await catalogs()).toEqual({ de: null, en: 5 });
      expect(await visibleText(page, "#A-title")).toBe("Welcome home");
    });

    await test.step("after the switch the full German catalog loads, the saved value with it", async () => {
      await page.evaluate(() => (globalThis as any).gateE.setLocale("de"));
      await expect.poll(() => visibleText(page, "#A-title"), POLL).toBe("Herzlich willkommen");
      expect(await visibleText(page, "#A-nested")).toBe("Über uns");
      expect(await visibleText(page, "#A-rich")).toBe("Lies die Bedingungen jetzt");
      const de = await page.evaluate(
        () => (globalThis as any).__COMVI__[0].x.state().c.default.de.m,
      );
      expect(Object.keys(de).sort()).toEqual(["home.title", "nav.about", "rich.terms"]);
    });
  });
});

/**
 * D2: a new server snapshot replaces the pair (the snapshot wins, nothing re-applies the
 * patch); a patch of a pair the snapshot does not carry survives; the text in the open form
 * is the editor's own state and stays.
 */
test("after a new server snapshot and a client navigation the editor sees the current state", async () => {
  await withGateE({}, async (launched, popups) => {
    const { page, tabId } = await openSite(launched, "/app");
    await enable(launched, popups, page, tabId);

    await openEditor(page, "#A-common");
    await typeInto(page, "English", "Store it");
    await save(page);
    await closeDialog(page);
    await openEditor(page, "#A-title");
    await typeInto(page, "English", "Saved locally");
    await save(page);
    await expect.poll(() => visibleText(page, "#A-title"), POLL).toBe("Saved locally");

    await test.step("unsaved text in the open form survives the snapshot", async () => {
      await typeInto(page, "English", "Typed, not saved");
      await page.evaluate(() =>
        (globalThis as any).gateE.snapshot("en", "default", {
          home: { title: "From the server" },
          nav: { about: "About us" },
          only: { en: "Only in English" },
          rich: { terms: "Read the <b>terms</b> now" },
        }),
      );
      await expect(field(page, "English")).toHaveValue("Typed, not saved");
      await closeDialog(page);
    });

    await test.step("the snapshot wins for its pair; the other pair keeps its patch", async () => {
      await expect.poll(() => visibleText(page, "#A-title"), POLL).toBe("From the server");
      expect(await visibleText(page, "#A-common")).toBe("Store it");
      // The editor re-applied nothing: still one save of each key, and the marks are current.
      expect(saves(await apiLog())).toHaveLength(2);
      expect(await framesIn(page, "#A-title")).toEqual([
        { inst: "", ns: "default", key: "home.title", close: false },
      ]);
    });

    await test.step("a client navigation to a route of a new namespace is marked and editable", async () => {
      await page.evaluate(() => (globalThis as any).gateE.navigate("about"));
      await expect
        .poll(() => framesIn(page, "#route-about-title"), POLL)
        .toEqual([{ inst: "", ns: "about", key: "about.title", close: false }]);
      await openEditor(page, "#route-about-title");
      await expect(field(page, "English")).toHaveValue("About this site", POLL);
      await typeInto(page, "English", "About this place");
      await save(page);
      await expect
        .poll(() => visibleText(page, "#route-about-title"), POLL)
        .toBe("About this place");
      expect(saves(await apiLog()).at(-1)).toMatchObject({
        key: "about.title",
        namespace: "about",
      });
      await closeDialog(page);
    });

    expect(contextRequests(await apiLog())).toEqual([]);
  });
});

/**
 * Owner update 2026-11-19, item 3b: the platform spells a language differently from the app's
 * locale. A SUCCESSFUL save must not leave the page on the old text: the editor finds the app's
 * own pair canonically and writes into it with the app's spelling, without a second pair.
 */
for (const [app, platform] of [
  ["pt-br", "pt-BR"],
  ["pt-BR", "pt-br"],
] as const) {
  test(`a save on an app running ${app} against a platform answering ${platform} updates the page`, async () => {
    await withGateE({}, async (launched, popups) => {
      await configureMock({ platformLocale: platform });
      const { page, tabId } = await openSite(launched, `/app?locale=${app}`);
      await expect.poll(() => visibleText(page, "#A-title"), POLL).toBe("Bem-vindo");
      await enable(launched, popups, page, tabId);

      await openEditor(page, "#A-title");
      await expect(field(page, "Portuguese")).toHaveValue("Bem-vindo", POLL);
      await typeInto(page, "Portuguese", "Bem-vindo de volta");
      expect(await save(page)).toContain("Saved");
      await closeDialog(page);

      expect(saves(await apiLog())).toEqual([
        expect.objectContaining({
          key: "home.title",
          translations: { [platform]: { value: "Bem-vindo de volta", status: "not_reviewed" } },
        }),
      ]);
      await expect.poll(() => visibleText(page, "#A-title"), POLL).toBe("Bem-vindo de volta");
      const pairs = await page.evaluate(() =>
        Object.keys((globalThis as any).__COMVI__[0].x.state().c.default).sort(),
      );
      // The app's chain (app → pt → en) and no pair spelled the platform's way.
      expect(pairs).toEqual(["en", "pt", app].sort());
    });
  });
}
