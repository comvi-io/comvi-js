/* @refresh reload */
import { render } from "solid-js/web";
import App from "./App";
import "./app.css";

const root = document.getElementById("app");

render(() => <App />, root!);
