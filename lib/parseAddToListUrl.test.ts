import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseAddToListUrl } from "./parseAddToListUrl";

describe("parseAddToListUrl", () => {
  it("reads item and list from the Timeplete scheme", () => {
    assert.deepEqual(
      parseAddToListUrl("timeplete://add-to-list?item=apples&list=grocery"),
      { item: "apples", list: "grocery" },
    );
  });

  it("defaults list to grocery", () => {
    assert.deepEqual(parseAddToListUrl("timeplete://add-to-list?item=milk"), {
      item: "milk",
      list: "grocery",
    });
  });

  it("rejects missing items and other routes", () => {
    assert.equal(parseAddToListUrl("timeplete://add-to-list"), null);
    assert.equal(parseAddToListUrl("timeplete://lists"), null);
  });
});
