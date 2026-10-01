import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Layer, Stage } from "react-konva";
import {
  CARD_BODY_MAX_LENGTH,
  CARD_NAME_MAX_LENGTH,
  CARD_TYPE_MAX_LENGTH,
  cardImageUrl,
  LibraryImageSchema,
  type CardDefinition,
  type LibraryImage,
} from "@card-table/shared";
import { z } from "zod";
import { CARD_HEIGHT, CARD_WIDTH, CardRenderer } from "../../../cards/CardRenderer";
import { ApiConflictError, apiRequest } from "../../../api/client";
import { errorMessage } from "../errors";
import { prepareCardImage } from "./prepare-card-image";

const ImagesResponseSchema = z.object({ images: z.array(LibraryImageSchema) });
const UploadResponseSchema = z.object({ image: z.object({ id: z.string() }) });
const CardResponseSchema = z.object({ card: z.object({ id: z.string() }) });

/** Creates a card when `card` is null, otherwise edits it at its loaded revision. */
export function CardEditor({
  setId,
  card,
  onClose,
  onSaved,
}: {
  setId: string;
  card: CardDefinition | null;
  onClose(): void;
  onSaved(): void;
}) {
  const [name, setName] = useState(card?.name ?? "");
  const [type, setType] = useState(card?.type ?? "");
  const [body, setBody] = useState(card?.body ?? "");
  const [imageId, setImageId] = useState(card?.imageId ?? "");
  const [images, setImages] = useState<LibraryImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadImages() {
    setImages((await apiRequest("/api/images", ImagesResponseSchema)).images);
  }

  useEffect(() => {
    loadImages().catch((cause: unknown) => setError(errorMessage(cause, "Could not load images.")));
  }, []);

  const preview: CardDefinition = {
    id: card?.id ?? "preview",
    setId,
    name: name || "Card name",
    type: type || "Type",
    body,
    imageId,
    imageUrl: imageId ? cardImageUrl(imageId) : "",
    position: 0,
    revision: card?.revision ?? 1,
    archived: false,
    updatedAt: 0,
  };

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const source = event.target.files?.[0];
    if (!source) return;
    setBusy(true);
    setError(null);
    try {
      const image = await prepareCardImage(source);
      const response = await apiRequest("/api/images", UploadResponseSchema, {
        method: "POST",
        headers: { "Content-Type": "image/png" },
        body: image,
      });
      setImageId(response.image.id);
      await loadImages();
    } catch (cause: unknown) {
      setError(errorMessage(cause, "Could not upload image."));
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!imageId) {
      setError("Choose or upload artwork first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = { name, type, body, imageId };
      if (card) {
        await apiRequest(`/api/cards/${card.id}`, CardResponseSchema, {
          method: "PUT",
          body: JSON.stringify({ ...payload, revision: card.revision }),
        });
      } else {
        await apiRequest(`/api/sets/${setId}/cards`, CardResponseSchema, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      onSaved();
    } catch (cause: unknown) {
      setError(
        cause instanceof ApiConflictError
          ? "This card changed elsewhere. Your draft has been kept; reload the card before trying again."
          : errorMessage(cause, "Could not save card."),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="editor-backdrop" role="presentation">
      <form className="card-editor" aria-label={card ? "Edit card" : "New card"}
        onSubmit={(event) => void save(event)}>
        <header>
          <h2>{card ? "Edit card" : "New card"}</h2>
          <button type="button" onClick={onClose}>Close</button>
        </header>
        {error && <p className="workspace-error" role="alert">{error}</p>}
        <div className="editor-layout">
          <div className="editor-form">
            <label>
              Name
              <input required maxLength={CARD_NAME_MAX_LENGTH} value={name}
                onChange={(event) => setName(event.target.value)} />
            </label>
            <label>
              Type
              <input required maxLength={CARD_TYPE_MAX_LENGTH} value={type}
                onChange={(event) => setType(event.target.value)} />
            </label>
            <label>
              Rules text
              <textarea maxLength={CARD_BODY_MAX_LENGTH} value={body}
                onChange={(event) => setBody(event.target.value)} />
            </label>
            <label>
              Upload artwork
              <input type="file" accept="image/png,image/jpeg" onChange={(event) => void upload(event)} />
            </label>
            <label>
              Existing artwork
              <select value={imageId} onChange={(event) => setImageId(event.target.value)}>
                <option value="">Choose artwork</option>
                {images.map((image) => (
                  <option key={image.id} value={image.id}>
                    {image.id.slice(0, 12)}… ({image.width}×{image.height})
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={busy}>{busy ? "Saving…" : "Save card"}</button>
          </div>
          <div className="card-preview">
            <p>Live preview</p>
            <Stage width={CARD_WIDTH} height={CARD_HEIGHT}>
              <Layer>
                <CardRenderer definition={preview} face="front" />
              </Layer>
            </Stage>
          </div>
        </div>
      </form>
    </div>
  );
}
