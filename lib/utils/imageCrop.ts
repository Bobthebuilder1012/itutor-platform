/**
 * Image cropping and resizing utilities
 */

export type Area = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Creates a cropped image from the source image and crop area
 */
export async function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area
): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  // Set canvas size to the cropped area
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  // Draw the cropped image
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  // Convert canvas to blob
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to create blob from canvas'));
      }
    }, 'image/jpeg', 0.95);
  });
}

/**
 * Resizes an image blob to specified dimensions
 */
export async function resizeImage(
  blob: Blob,
  maxWidth: number = 400,
  maxHeight: number = 400
): Promise<Blob> {
  const imageSrc = URL.createObjectURL(blob);
  const image = await createImage(imageSrc);
  
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  // Calculate new dimensions maintaining aspect ratio
  let { width, height } = image;
  
  if (width > height) {
    if (width > maxWidth) {
      height = (height * maxWidth) / width;
      width = maxWidth;
    }
  } else {
    if (height > maxHeight) {
      width = (width * maxHeight) / height;
      height = maxHeight;
    }
  }

  canvas.width = width;
  canvas.height = height;

  // Draw resized image
  ctx.drawImage(image, 0, 0, width, height);

  // Clean up
  URL.revokeObjectURL(imageSrc);

  // Convert to blob
  return new Promise((resolve, reject) => {
    canvas.toBlob((resizedBlob) => {
      if (resizedBlob) {
        resolve(resizedBlob);
      } else {
        reject(new Error('Failed to resize image'));
      }
    }, 'image/jpeg', 0.95);
  });
}

/**
 * Creates an image element from a source URL
 */
function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.setAttribute('crossOrigin', 'anonymous');
    image.src = url;
  });
}

/**
 * Converts a blob to base64 string
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to convert blob to base64'));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Validates image file type and size
 */
export function validateImageFile(file: File): { valid: boolean; error?: string } {
  const MAX_SIZE = 5 * 1024 * 1024; // 5MB
  const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

  if (!ALLOWED_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: 'Please upload a valid image file (JPEG, PNG, or WebP)',
    };
  }

  if (file.size > MAX_SIZE) {
    return {
      valid: false,
      error: 'Image size must be less than 5MB',
    };
  }

  return { valid: true };
}









