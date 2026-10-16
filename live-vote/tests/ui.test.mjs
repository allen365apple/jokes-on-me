import test from "node:test";
import assert from "node:assert/strict";
import { membersMarkup } from "../ui.mjs";

test("team member markup includes the portrait and visible name", () => {
  const markup = membersMarkup([
    {
      name: "傑哥",
      avatar: "../love-improv/profiles/thumbs/傑哥.jpg",
      position: 35,
    },
  ]);

  assert.match(markup, /<span class="members">/);
  assert.match(
    markup,
    /<img src="\.\.\/love-improv\/profiles\/thumbs\/傑哥\.jpg"/,
  );
  assert.match(markup, /<span class="member-name">傑哥<\/span>/);
});
