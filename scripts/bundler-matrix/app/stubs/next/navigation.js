// Inert `next/navigation`. See package.json.
const unavailable = (name) => () => {
  throw new Error(`[bundler-matrix] next/navigation ${name}() is a stub and must not be called`);
};

export const usePathname = unavailable("usePathname");
export const useRouter = unavailable("useRouter");
export const useSearchParams = unavailable("useSearchParams");
export const useParams = unavailable("useParams");
export const redirect = unavailable("redirect");
export const notFound = unavailable("notFound");
