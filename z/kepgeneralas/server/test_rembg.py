import requests
from io import BytesIO
from PIL import Image
from rembg import remove
import os

def main():
    print("--- STARTING REMBG BACKGROUND REMOVAL TEST ---")
    image_url = 'https://magazin.kocsi.hu/wp-content/uploads/2025/06/Audi-Q3-2026-SUV-4-scaled-1.jpg'
    output_dir = 'renders'
    
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        
    output_path = os.path.join(output_dir, 'test-rembg-audi.png')
    
    print(f"Downloading original image from: {image_url}")
    try:
        response = requests.get(image_url, timeout=15)
        response.raise_for_status()
        input_image = Image.open(BytesIO(response.content))
        print("Image downloaded successfully. Original size:", input_image.size)
    except Exception as e:
        print(f"Failed to download image: {e}")
        return

    print("Removing background using rembg...")
    try:
        # rembg automatically downloads the u2net model on its first run (approx. 170MB)
        output_image = remove(input_image)
        print("Background removed successfully.")
        
        # Save output
        output_image.save(output_path)
        print(f"Transparent cutout saved to: {os.path.abspath(output_path)}")
        print("--- TEST SUCCESS ---")
    except Exception as e:
        print(f"Failed to remove background: {e}")

if __name__ == "__main__":
    main()
