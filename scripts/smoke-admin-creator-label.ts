/**
 * Offline smoke for api/_adminCreatorLabel.ts (no Firebase).
 * Run: npm run smoke:admin-labels
 */
import assert from "node:assert/strict";

import {
  adminCreatorLabelFromCreatorDoc,
  adminCreatorLabelFromUserDoc,
  adminCreatorShortUidFallback,
  isPlaceholderAdminCreatorDisplay,
} from "../api/_adminCreatorLabel.ts";

function eq(actual: unknown, expected: unknown, msg?: string): void {
  assert.equal(actual, expected, msg);
}

// placeholders
eq(isPlaceholderAdminCreatorDisplay(""), true);
eq(isPlaceholderAdminCreatorDisplay("  "), true);
eq(isPlaceholderAdminCreatorDisplay("New User"), true);
eq(isPlaceholderAdminCreatorDisplay("MEMBER"), true);
eq(isPlaceholderAdminCreatorDisplay("user"), true);
eq(isPlaceholderAdminCreatorDisplay("Jane Creator"), false);

// creator doc: handle wins over junk displayName
eq(
  adminCreatorLabelFromCreatorDoc({ handle: "coolcreator", displayName: "New User" }),
  "@coolcreator",
);
eq(adminCreatorLabelFromCreatorDoc({ handle: "@leaf", displayName: "Leaf" }), "@leaf");
eq(adminCreatorLabelFromCreatorDoc({ displayName: "Real Name" }), "Real Name");
eq(adminCreatorLabelFromCreatorDoc({ displayName: "Member" }), "");
eq(adminCreatorLabelFromCreatorDoc(undefined), "");

// user doc: @username then displayName
eq(
  adminCreatorLabelFromUserDoc({ username: "fan123", displayName: "New User" }),
  "@fan123",
);
eq(adminCreatorLabelFromUserDoc({ displayName: "Legacy Only" }), "Legacy Only");
eq(adminCreatorLabelFromUserDoc({ username: "@edge" }), "@edge");
eq(adminCreatorLabelFromUserDoc(undefined), "");

// uid fallback
eq(adminCreatorShortUidFallback("abcdefghijklmnopqrst"), "abcdefgh…");
eq(adminCreatorShortUidFallback("short"), "short");
eq(adminCreatorShortUidFallback("   "), "—");

console.log("smoke-admin-creator-label: OK");
