import { useMemo } from "react";
import { copyText } from "../keys";
import { shareUrl } from "../share";
import type { WheelList } from "../types";
import Dialog from "./Dialog";

type ShareDialogProps = {
  list: WheelList;
  onClose: () => void;
  toast: (message: string) => void;
};

export default function ShareDialog({ list, onClose, toast }: ShareDialogProps) {
  const url = useMemo(() => shareUrl(list), [list]);
  const canShare = typeof navigator.share === "function";

  async function copy() {
    const copied = await copyText(url);
    toast(copied ? "Link copied" : "Couldn't copy the link. Select it and copy it instead.");
  }

  function share() {
    navigator.share({ title: list.name, text: `Spin my "${list.name}" wheel`, url }).catch(() => undefined);
  }

  return (
    <Dialog title={`Share "${list.name}"`} onClose={onClose}>
      <p className="dialog-text">
        Anyone who opens this link can add a copy of this wheel. Nothing is uploaded: the options travel inside the link.
      </p>
      <input className="share-url" readOnly value={url} onFocus={(event) => event.currentTarget.select()} aria-label="Share link" />
      <div className="dialog-row">
        <button onClick={copy}>Copy link</button>
        {canShare && (
          <button className="secondary" onClick={share}>
            Share…
          </button>
        )}
      </div>
      {url.length > 2000 && (
        <p className="dialog-note">This wheel has a lot of options, so the link is long and some apps may cut it off.</p>
      )}
    </Dialog>
  );
}
