import {
  cropAspectRatio,
  cropImageScale,
  cropImageSize,
  cropSettings,
  cropSettingsChanged,
  showCancelConfirmDialog,
  type CropSettings,
} from '$lib/stores/asset-editor.store';
import { get } from 'svelte/store';
import { draw } from './canvas-drawing';
import { adjustDimensions, keepAspectRatio } from './crop-settings';
import {
  animationFrame,
  canvasCursor,
  canvasElement,
  darkenLevel,
  dragOffset,
  isDragging,
  isResizingOrDragging,
  padding,
  resizeSide,
} from './crop-store';
const mPadding = get(padding);

export function handleMouseDown(e: MouseEvent) {
  const canvas = get(canvasElement);
  if (!canvas) {
    return;
  }

  const crop = get(cropSettings);
  const { mouseX, mouseY } = getMousePosition(e);

  const {
    onLeftBoundary,
    onRightBoundary,
    onTopBoundary,
    onBottomBoundary,
    onTopLeftCorner,
    onTopRightCorner,
    onBottomLeftCorner,
    onBottomRightCorner,
  } = isOnCropBoundary(mouseX, mouseY, crop);

  if (
    onTopLeftCorner ||
    onTopRightCorner ||
    onBottomLeftCorner ||
    onBottomRightCorner ||
    onLeftBoundary ||
    onRightBoundary ||
    onTopBoundary ||
    onBottomBoundary
  ) {
    setResizeSide(mouseX, mouseY);
  } else if (isInCropArea(mouseX, mouseY, crop)) {
    startDragging(mouseX, mouseY);
  }

  document.body.style.userSelect = 'none';
  window.addEventListener('mouseup', handleMouseUp);
}

export function handleMouseMove(e: MouseEvent) {
  const canvas = get(canvasElement);
  if (!canvas) {
    return;
  }

  const resizeSideValue = get(resizeSide);
  const { mouseX, mouseY } = getMousePosition(e);

  if (get(isDragging)) {
    moveCrop(mouseX, mouseY);
  } else if (resizeSideValue) {
    resizeCrop(mouseX, mouseY);
  } else {
    updateCursor(mouseX, mouseY);
  }
}

export function handleMouseUp() {
  window.removeEventListener('mouseup', handleMouseUp);
  document.body.style.userSelect = '';
  stopInteraction();
}

export function handleMouseOut() {
  // stopInteraction();
  // window.removeEventListener('mouseup', handleMouseUp);
}

function getMousePosition(e: MouseEvent) {
  let offsetX = e.clientX - mPadding;
  let offsetY = e.clientY - mPadding;
  const clienRect = getBoundingClientRectCached(get(canvasElement));

  offsetX -= clienRect?.left ?? 0;
  offsetY -= clienRect?.top ?? 0;

  return { mouseX: offsetX, mouseY: offsetY };
}

type BoundingClientRect = ReturnType<HTMLElement['getBoundingClientRect']>;
let getBoundingClientRectCache: { data: BoundingClientRect | null; time: number } = {
  data: null,
  time: 0,
};

function getBoundingClientRectCached(el: HTMLElement | null) {
  if (Date.now() - getBoundingClientRectCache.time > 5000 || getBoundingClientRectCache.data === null) {
    getBoundingClientRectCache = {
      time: Date.now(),
      data: el?.getBoundingClientRect() ?? null,
    };
  }
  return getBoundingClientRectCache.data;
}

function isOnCropBoundary(mouseX: number, mouseY: number, crop: CropSettings) {
  const { x, y, width, height } = crop;
  const sensitivity = 10;
  const cornerSensitivity = 15;

  const onLeftBoundary = mouseX >= x - sensitivity && mouseX <= x + sensitivity && mouseY >= y && mouseY <= y + height;
  const onRightBoundary =
    mouseX >= x + width - sensitivity && mouseX <= x + width + sensitivity && mouseY >= y && mouseY <= y + height;
  const onTopBoundary = mouseY >= y - sensitivity && mouseY <= y + sensitivity && mouseX >= x && mouseX <= x + width;
  const onBottomBoundary =
    mouseY >= y + height - sensitivity && mouseY <= y + height + sensitivity && mouseX >= x && mouseX <= x + width;

  const onTopLeftCorner =
    mouseX >= x - cornerSensitivity &&
    mouseX <= x + cornerSensitivity &&
    mouseY >= y - cornerSensitivity &&
    mouseY <= y + cornerSensitivity;
  const onTopRightCorner =
    mouseX >= x + width - cornerSensitivity &&
    mouseX <= x + width + cornerSensitivity &&
    mouseY >= y - cornerSensitivity &&
    mouseY <= y + cornerSensitivity;
  const onBottomLeftCorner =
    mouseX >= x - cornerSensitivity &&
    mouseX <= x + cornerSensitivity &&
    mouseY >= y + height - cornerSensitivity &&
    mouseY <= y + height + cornerSensitivity;
  const onBottomRightCorner =
    mouseX >= x + width - cornerSensitivity &&
    mouseX <= x + width + cornerSensitivity &&
    mouseY >= y + height - cornerSensitivity &&
    mouseY <= y + height + cornerSensitivity;

  return {
    onLeftBoundary,
    onRightBoundary,
    onTopBoundary,
    onBottomBoundary,
    onTopLeftCorner,
    onTopRightCorner,
    onBottomLeftCorner,
    onBottomRightCorner,
  };
}

function isInCropArea(mouseX: number, mouseY: number, crop: CropSettings) {
  const { x, y, width, height } = crop;
  return mouseX >= x && mouseX <= x + width && mouseY >= y && mouseY <= y + height;
}

function setResizeSide(mouseX: number, mouseY: number) {
  const crop = get(cropSettings);
  const {
    onLeftBoundary,
    onRightBoundary,
    onTopBoundary,
    onBottomBoundary,
    onTopLeftCorner,
    onTopRightCorner,
    onBottomLeftCorner,
    onBottomRightCorner,
  } = isOnCropBoundary(mouseX, mouseY, crop);

  if (onTopLeftCorner) {
    resizeSide.set('top-left');
  } else if (onTopRightCorner) {
    resizeSide.set('top-right');
  } else if (onBottomLeftCorner) {
    resizeSide.set('bottom-left');
  } else if (onBottomRightCorner) {
    resizeSide.set('bottom-right');
  } else if (onLeftBoundary) {
    resizeSide.set('left');
  } else if (onRightBoundary) {
    resizeSide.set('right');
  } else if (onTopBoundary) {
    resizeSide.set('top');
  } else if (onBottomBoundary) {
    resizeSide.set('bottom');
  }
}

function startDragging(mouseX: number, mouseY: number) {
  isDragging.set(true);
  const crop = get(cropSettings);
  isResizingOrDragging.set(true);
  dragOffset.set({ x: mouseX - crop.x - mPadding, y: mouseY - crop.y - mPadding });
  fadeOverlay(false);
}

function moveCrop(mouseX: number, mouseY: number) {
  const canvas = get(canvasElement);
  if (!canvas) {
    return;
  }

  const crop = get(cropSettings);
  const { x, y } = get(dragOffset);

  let newX = mouseX - x;
  let newY = mouseY - y;

  newX = Math.max(mPadding, Math.min(canvas.width - crop.width - mPadding, newX));
  newY = Math.max(mPadding, Math.min(canvas.height - crop.height - mPadding, newY));

  cropSettings.update((crop) => {
    crop.x = newX - mPadding;
    crop.y = newY - mPadding;
    return crop;
  });

  draw(canvas, crop);
}

function resizeCrop(mouseX: number, mouseY: number) {
  const canvas = get(canvasElement);
  const crop = get(cropSettings);
  const resizeSideValue = get(resizeSide);
  if (!canvas || !resizeSideValue) {
    return;
  }
  fadeOverlay(false);

  const { x, y, width, height } = crop;
  const minSize = 10;
  let newWidth, newHeight;
  const canvasW = canvas.width - mPadding * 2;
  const canvasH = canvas.height - mPadding * 2;
  switch (resizeSideValue) {
    case 'left': {
      newWidth = width + x - mouseX;
      newHeight = height;
      if (newWidth >= minSize && mouseX >= 0) {
        const { newWidth: w, newHeight: h } = keepAspectRatio(newWidth, newHeight, get(cropAspectRatio));
        cropSettings.update((crop) => {
          crop.width = Math.min(w, canvasW);
          crop.height = Math.min(h, canvasH);
          crop.x = Math.max(0, x + width - crop.width);
          return crop;
        });
      }
      break;
    }
    case 'right': {
      newWidth = mouseX - x;
      newHeight = height;
      if (newWidth >= minSize && mouseX <= canvasW) {
        const { newWidth: w, newHeight: h } = keepAspectRatio(newWidth, newHeight, get(cropAspectRatio));
        cropSettings.update((crop) => {
          crop.width = Math.min(w, canvasW - x);
          crop.height = Math.min(h, canvasH);
          return crop;
        });
      }
      break;
    }
    case 'top': {
      newHeight = height + y - mouseY;
      newWidth = width;
      if (newHeight >= minSize && mouseY >= 0) {
        const { newWidth: w, newHeight: h } = adjustDimensions(
          newWidth,
          newHeight,
          get(cropAspectRatio),
          canvasW,
          canvasH,
        );
        cropSettings.update((crop) => {
          crop.y = Math.max(0, y + height - h);
          crop.width = w;
          crop.height = h;
          return crop;
        });
      }
      break;
    }
    case 'bottom': {
      newHeight = mouseY - y;
      newWidth = width;
      if (newHeight >= minSize && mouseY <= canvasH) {
        const { newWidth: w, newHeight: h } = adjustDimensions(
          newWidth,
          newHeight,
          get(cropAspectRatio),
          canvasW,
          canvasH - y,
        );
        cropSettings.update((crop) => {
          crop.width = w;
          crop.height = h;
          return crop;
        });
      }
      break;
    }
    case 'top-left': {
      newWidth = width + x - Math.max(mouseX, 0);
      newHeight = height + y - Math.max(mouseY, 0);
      if (newWidth >= minSize && newHeight >= minSize) {
        const { newWidth: w, newHeight: h } = adjustDimensions(
          newWidth,
          newHeight,
          get(cropAspectRatio),
          canvasW,
          canvasH,
        );
        cropSettings.update((crop) => {
          crop.width = w;
          crop.height = h;
          crop.x = Math.max(0, x + width - crop.width);
          crop.y = Math.max(0, y + height - crop.height);
          return crop;
        });
      }
      break;
    }
    case 'top-right': {
      newWidth = Math.max(mouseX, 0) - x;
      newHeight = height + y - Math.max(mouseY, 0);
      if (newWidth >= minSize && newHeight >= minSize) {
        const { newWidth: w, newHeight: h } = adjustDimensions(
          newWidth,
          newHeight,
          get(cropAspectRatio),
          canvasW - x,
          y + height,
        );
        cropSettings.update((crop) => {
          crop.width = w;
          crop.height = h;
          crop.y = y + height - h;
          return crop;
        });
      }
      break;
    }
    case 'bottom-left': {
      newWidth = width + x - Math.max(mouseX, 0);
      newHeight = Math.max(mouseY, 0) - y;
      if (newWidth >= minSize && newHeight >= minSize) {
        const { newWidth: w, newHeight: h } = adjustDimensions(
          newWidth,
          newHeight,
          get(cropAspectRatio),
          canvasW,
          canvasH - y,
        );
        cropSettings.update((crop) => {
          crop.width = w;
          crop.height = h;
          crop.x = Math.max(0, x + width - crop.width);
          return crop;
        });
      }
      break;
    }
    case 'bottom-right': {
      newWidth = Math.max(mouseX, 0) - x;
      newHeight = Math.max(mouseY, 0) - y;
      if (newWidth >= minSize && newHeight >= minSize) {
        const { newWidth: w, newHeight: h } = adjustDimensions(
          newWidth,
          newHeight,
          get(cropAspectRatio),
          canvasW - x,
          canvasH - y,
        );
        cropSettings.update((crop) => {
          crop.width = w;
          crop.height = h;
          return crop;
        });
      }
      break;
    }
  }

  cropSettings.update((crop) => {
    crop.x = Math.max(0, Math.min(crop.x, canvasW - crop.width));
    crop.y = Math.max(0, Math.min(crop.y, canvasH - crop.height));
    return crop;
  });

  draw(canvas, crop);
}

function updateCursor(mouseX: number, mouseY: number) {
  const canvas = get(canvasElement);
  if (!canvas) {
    return;
  }

  const crop = get(cropSettings);
  const {
    onLeftBoundary,
    onRightBoundary,
    onTopBoundary,
    onBottomBoundary,
    onTopLeftCorner,
    onTopRightCorner,
    onBottomLeftCorner,
    onBottomRightCorner,
  } = isOnCropBoundary(mouseX, mouseY, crop);

  if (onTopLeftCorner || onBottomRightCorner) {
    setCursor('nwse-resize');
  } else if (onTopRightCorner || onBottomLeftCorner) {
    setCursor('nesw-resize');
  } else if (onLeftBoundary || onRightBoundary) {
    setCursor('ew-resize');
  } else if (onTopBoundary || onBottomBoundary) {
    setCursor('ns-resize');
  } else if (isInCropArea(mouseX, mouseY, crop)) {
    setCursor('move');
  } else {
    setCursor('default');
  }

  function setCursor(cursorName: string) {
    if (get(canvasCursor) != cursorName && canvas && !get(showCancelConfirmDialog)) {
      canvasCursor.set(cursorName);
      document.body.style.cursor = cursorName;
      canvas.style.cursor = cursorName;
    }
  }
}

function stopInteraction() {
  isResizingOrDragging.set(false);
  isDragging.set(false);
  resizeSide.set('');
  fadeOverlay(true); // Darken the background

  setTimeout(() => {
    checkEdits();
  }, 1);
}

export function checkEdits() {
  const cropImageSizeParams = get(cropSettings);
  const originalImgSize = get(cropImageSize).map((el) => el * get(cropImageScale));
  const changed =
    Math.abs(originalImgSize[0] - cropImageSizeParams.width) > 2 ||
    Math.abs(originalImgSize[1] - cropImageSizeParams.height) > 2;
  cropSettingsChanged.set(changed);
}

function fadeOverlay(toDark: boolean) {
  const step = toDark ? 0.05 : -0.05;
  const minDarkness = 0.4;
  const maxDarkness = 0.65;

  isResizingOrDragging.set(!toDark);

  const animate = () => {
    darkenLevel.update((level) => {
      const newLevel = Math.min(maxDarkness, Math.max(minDarkness, level + step));
      draw(get(canvasElement), get(cropSettings));
      return newLevel;
    });

    if ((toDark && get(darkenLevel) < maxDarkness) || (!toDark && get(darkenLevel) > minDarkness)) {
      animationFrame.set(requestAnimationFrame(animate));
    } else {
      cancelAnimationFrame(get(animationFrame) as number);
    }
  };

  cancelAnimationFrame(get(animationFrame) as number);
  animationFrame.set(requestAnimationFrame(animate));
}