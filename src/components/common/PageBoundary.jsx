import { Component } from "react";
import Button from "./Button";

/** Keep navigation available if a page chunk fails to download or render. */
export default class PageBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="container section" role="alert">
        <h1>This page could not be opened</h1>
        <p>Please check your connection and reload the page.</p>
        <Button onClick={() => window.location.reload()}>Reload page</Button>
      </section>
    );
  }
}
