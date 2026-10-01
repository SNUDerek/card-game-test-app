import type { CardDefinition } from "@card-table/shared";

/** A library card as the client receives it, with test-friendly defaults. */
export function cardDefinition(overrides: Partial<CardDefinition> & { id: string }): CardDefinition {
  return {
    setId: "set-1",
    name: overrides.id,
    type: "spell",
    body: "",
    imageId: `image-${overrides.id}`,
    imageUrl: `/images/image-${overrides.id}`,
    position: 0,
    revision: 1,
    archived: false,
    updatedAt: 0,
    ...overrides,
  };
}
