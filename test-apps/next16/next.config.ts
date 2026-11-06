import path from "path";
import { withComvi } from "@comvi/next/plugin";

export default withComvi()({
  outputFileTracingRoot: path.resolve(__dirname, "../../"),
});
