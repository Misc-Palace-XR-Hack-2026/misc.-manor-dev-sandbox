import { OBJECT_KINDS, OBJECT_LABELS, type ObjectKind } from '../core/types';
import { kindThumbnail } from './kind-thumbnail';

export function buildKindInventory(options: {
  value: ObjectKind | '';
  onChange: (kind: ObjectKind) => void;
  allowEmpty?: boolean;
}): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'kind-inventory';

  const current = document.createElement('button');
  current.type = 'button';
  current.className = 'kind-current';
  current.setAttribute('aria-expanded', 'false');
  current.setAttribute('aria-haspopup', 'listbox');

  const picker = document.createElement('div');
  picker.className = 'kind-picker';
  picker.setAttribute('role', 'listbox');
  picker.setAttribute('aria-label', 'Object representation');
  picker.hidden = true;

  const renderCurrent = (value: ObjectKind | '') => {
    current.replaceChildren();
    if (value) {
      current.append(kindThumbnail(value), Object.assign(document.createElement('span'), {
        className: 'kind-label',
        textContent: OBJECT_LABELS[value],
      }));
      current.setAttribute('aria-label', `Change object, currently ${OBJECT_LABELS[value]}`);
    } else {
      current.append(Object.assign(document.createElement('span'), {
        className: 'kind-label',
        textContent: 'Automatic by content type',
      }));
      current.setAttribute('aria-label', 'Choose object representation');
    }
  };

  const close = () => {
    picker.hidden = true;
    current.setAttribute('aria-expanded', 'false');
  };

  const open = () => {
    picker.hidden = false;
    current.setAttribute('aria-expanded', 'true');
  };

  current.addEventListener('click', (e) => {
    e.stopPropagation();
    if (picker.hidden) open();
    else close();
  });

  if (options.allowEmpty) {
    const auto = document.createElement('button');
    auto.type = 'button';
    auto.className = 'kind-choice';
    auto.dataset.kind = '';
    auto.setAttribute('role', 'option');
    auto.append(Object.assign(document.createElement('span'), { className: 'kind-label', textContent: 'Automatic' }));
    auto.addEventListener('click', (e) => {
      e.stopPropagation();
      renderCurrent('');
      close();
      options.onChange('' as ObjectKind);
    });
    picker.append(auto);
  }

  for (const k of OBJECT_KINDS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'kind-choice';
    button.title = OBJECT_LABELS[k];
    button.setAttribute('aria-label', OBJECT_LABELS[k]);
    button.dataset.kind = k;
    button.setAttribute('role', 'option');
    button.append(kindThumbnail(k), Object.assign(document.createElement('span'), {
      className: 'kind-label',
      textContent: OBJECT_LABELS[k],
    }));
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      renderCurrent(k);
      close();
      options.onChange(k);
    });
    picker.append(button);
  }

  renderCurrent(options.value);
  wrap.append(current, picker);
  return wrap;
}
