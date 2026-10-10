import HomePage from "../page";

// The home page rendered on every request instead of prerendered: the server
// loads catalogs at request time here, so requests in different locales share
// the one module-scope instance concurrently.
export const dynamic = "force-dynamic";

export default HomePage;
