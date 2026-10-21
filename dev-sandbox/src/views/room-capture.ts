export function createRoomCapture(capture: () => Promise<Blob>): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'room-capture'; button.textContent = 'Take photo';
  button.addEventListener('click', async () => {
    button.disabled = true;
    const dialog = document.createElement('dialog'); dialog.className = 'content-dialog photo-dialog';
    dialog.setAttribute('aria-label', 'Room photo');
    const heading = document.createElement('h2'); heading.textContent = 'Room photo';
    const status = document.createElement('p'); status.setAttribute('role', 'status');
    status.textContent = 'Preparing PNG…';
    const close = document.createElement('button'); close.textContent = 'Close';
    close.onclick = () => dialog.close();
    dialog.append(heading, status, close); document.body.append(dialog); dialog.showModal();
    let url: string | undefined;
    dialog.addEventListener('close', () => { if (url) URL.revokeObjectURL(url); dialog.remove(); button.focus(); });
    try {
      const blob = await capture();
      if (!dialog.open) return;
      const file = new File([blob], 'misc-manor-room.png', {type: 'image/png'});
      url = URL.createObjectURL(file);
      const image = document.createElement('img'); image.src = url; image.alt = 'Captured room';
      const download = document.createElement('button'); download.textContent = 'Download PNG';
      download.onclick = () => {
        const a = document.createElement('a'); a.href = url!; a.download = file.name;
        document.body.append(a); a.click(); a.remove();
      };
      dialog.insertBefore(image, status); dialog.insertBefore(download, close);
      status.textContent = 'Save or share this room photo. Nothing is uploaded automatically.';
      if (navigator.canShare?.({files: [file]}) && navigator.share) {
        const share = document.createElement('button'); share.textContent = 'Share photo';
        share.onclick = async () => {
          share.disabled = true;
          try { await navigator.share({files: [file], title: 'My Misc. Manor room'}); }
          catch (error) {
            status.textContent = error instanceof Error && error.name === 'AbortError'
              ? 'Sharing cancelled. Your photo is still available.'
              : 'Sharing unavailable. Use Download PNG instead.';
          } finally { share.disabled = false; }
        };
        dialog.insertBefore(share, download);
      }
    } catch (error) {
      status.textContent = `Could not capture the room: ${error instanceof Error ? error.message : String(error)}`;
    } finally { button.disabled = false; }
  });
  return button;
}
