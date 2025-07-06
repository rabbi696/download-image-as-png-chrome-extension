/**
 * @fileoverview Background script for the Image as PNG Downloader extension.
 * This script handles the creation of the context menu, fetching any image,
 * converting it to PNG format, and initiating the download.
 */

// --- Constants ---
const CONTEXT_MENU_ID = "download-image-as-png";
const CONTEXT_MENU_TITLE = "Download image as PNG";

/**
 * Creates a canvas and draws an image bitmap on it.
 * @param {ImageBitmap} imgBitmap The image bitmap to draw.
 * @returns {OffscreenCanvas} The canvas element with the image drawn.
 */
function createCanvasFromBitmap(imgBitmap) {
    // Use OffscreenCanvas for better performance as it's not in the DOM.
    const canvas = new OffscreenCanvas(imgBitmap.width, imgBitmap.height);
    const ctx = canvas.getContext('2d');

    // Draw the image onto the canvas.
    // Unlike JPG, PNG supports transparency, so we don't need to fill the background
    // unless we specifically want a white background for transparent images.
    // For consistency, we'll keep the white background.
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imgBitmap, 0, 0);

    return canvas;
}

/**
 * Converts a source image URL to a PNG blob.
 * @param {string} srcUrl The URL of the image to convert.
 * @returns {Promise<Blob>} A promise that resolves with the PNG blob.
 */
async function convertImageToPngBlob(srcUrl) {
    try {
        // Fetch the image data from the source URL.
        const response = await fetch(srcUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.statusText}`);
        }
        const originalBlob = await response.blob();

        // Create an ImageBitmap from the blob. This decodes the image format (AVIF, WEBP, etc.).
        const imageBitmap = await createImageBitmap(originalBlob);

        // Draw the bitmap onto a canvas.
        const canvas = createCanvasFromBitmap(imageBitmap);

        // Convert the canvas content to a PNG blob.
        return await canvas.convertToBlob({ type: 'image/png' });

    } catch (error) {
        console.error("Image conversion failed:", error);
        throw error; // Re-throw the error to be caught by the caller.
    }
}

/**
 * Converts a Blob to a Data URL. This is necessary because Service Workers
 * in Manifest V3 cannot use URL.createObjectURL().
 * @param {Blob} blob The blob to convert.
 * @returns {Promise<string>} A promise that resolves with the data URL.
 */
function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.onabort = () => reject(new Error("Blob to Data URL conversion aborted."));
        reader.readAsDataURL(blob);
    });
}


/**
 * Generates a new filename in the format 'image-YYYYMMDD-XXXXXX.png'.
 * @returns {string} The new filename ending in .png.
 */
function generatePngFilename() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
    const day = String(now.getDate()).padStart(2, '0');
    const todayDate = `${year}${month}${day}`;

    // Generate a random 6-digit number
    const randomNumber = Math.floor(100000 + Math.random() * 900000);

    return `image-${todayDate}-${randomNumber}.png`;
}


/**
 * Handles the click event from the context menu.
 * @param {object} info Information about the context menu click event.
 * @param {object} tab The tab where the click occurred.
 */
async function handleContextMenuClick(info, tab) {
    if (info.menuItemId !== CONTEXT_MENU_ID || !info.srcUrl) {
        return;
    }

    try {
        // Convert the image to a PNG blob.
        const pngBlob = await convertImageToPngBlob(info.srcUrl);

        // In Manifest V3 Service Workers, URL.createObjectURL is not available.
        // We must convert the blob to a data URL instead.
        const dataUrl = await blobToDataURL(pngBlob);
        const filename = generatePngFilename();

        // Use the downloads API to save the file using the data URL.
        chrome.downloads.download({
            url: dataUrl,
            filename: filename,
            saveAs: true // Ask the user where to save the file.
        });
        // No need to revoke a data URL.

    } catch (error) {
        // If an error occurs, we can notify the user by injecting a script.
        // This is more user-friendly than just logging to the console.
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (message) => alert(message),
            args: [`Failed to convert and download image: ${error.message}`],
        });
    }
}

// --- Event Listeners ---

// Fired when the extension is first installed, updated, or Chrome is updated.
chrome.runtime.onInstalled.addListener(() => {
    // Use chrome.contextMenus.update to prevent errors on reload, and create if it doesn't exist.
    chrome.contextMenus.create({
        id: CONTEXT_MENU_ID,
        title: CONTEXT_MENU_TITLE,
        contexts: ["image"] // This menu item will only appear when right-clicking an image.
    }, () => {
        if (chrome.runtime.lastError) {
            // If it already exists, update it. This is useful for development.
            chrome.contextMenus.update(CONTEXT_MENU_ID, { title: CONTEXT_MENU_TITLE });
        }
    });
});

// Add a listener for when the user clicks on the context menu item.
chrome.contextMenus.onClicked.addListener(handleContextMenuClick);
