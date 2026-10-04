import HomePage from "../page";

// The home page, rendered on EVERY request instead of prerendered. The SSG
// pages next door are built once per locale by `generateStaticParams`, so the
// server never loads a catalog for them at runtime; this route does, which is
// where two concurrent requests in different locales can meet in the one
// module-scope host. The e2e suite races /uk/live and /de/live through it.
export const dynamic = "force-dynamic";

export default HomePage;
