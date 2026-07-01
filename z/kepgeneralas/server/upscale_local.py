import os
import sys
import zipfile
import urllib.request
import subprocess
import platform

def download_and_extract(bin_dir="bin"):
    # Detect OS
    os_name = platform.system().lower()
    
    if not os.path.exists(bin_dir):
        os.makedirs(bin_dir)
        
    # Choose correct zip based on OS
    if "windows" in os_name:
        zip_name = "realesrgan-ncnn-vulkan-20220424-windows.zip"
        binary_name = "realesrgan-ncnn-vulkan.exe"
    elif "darwin" in os_name: # macOS
        zip_name = "realesrgan-ncnn-vulkan-20220424-macos.zip"
        binary_name = "realesrgan-ncnn-vulkan"
    else: # Linux
        zip_name = "realesrgan-ncnn-vulkan-20220424-ubuntu.zip"
        binary_name = "realesrgan-ncnn-vulkan"
        
    url = f"https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/{zip_name}"
    zip_path = os.path.join(bin_dir, zip_name)
    binary_path = os.path.join(bin_dir, binary_name)
    
    if not os.path.exists(binary_path):
        print(f"Downloading binary from {url}...")
        urllib.request.urlretrieve(url, zip_path)
        print(f"Extracting {zip_name}...")
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(bin_dir)
        # Clean up zip file
        os.remove(zip_path)
        
        # On Unix systems, make it executable
        if "windows" not in os_name:
            os.chmod(binary_path, 0o755)
            
        print("Binary ready!")
    
    return binary_path

def main():
    if len(sys.argv) < 3:
        print("Usage: python upscale_local.py <input_path> <output_path>")
        sys.exit(1)
        
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    
    if not os.path.exists(input_path):
        print(f"Error: Input file {input_path} does not exist.")
        sys.exit(1)
        
    try:
        # Determine the directory of the script to resolve the bin folder path correctly
        script_dir = os.path.dirname(os.path.abspath(__file__))
        bin_dir = os.path.join(script_dir, "bin")
        
        # Ensure binary exists (downloads it on the first run)
        binary_path = download_and_extract(bin_dir)
        
        print(f"Running Real-ESRGAN local upscale: {input_path} -> {output_path}")
        # Run Real-ESRGAN-ncnn-vulkan on the image
        # Using scale 4x (realesrgan-x4plus)
        cmd = [binary_path, "-i", input_path, "-o", output_path, "-n", "realesrgan-x4plus", "-s", "4"]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            print("SUCCESS")
        else:
            print(f"Error running upscaler. Return code: {result.returncode}")
            print(f"STDOUT: {result.stdout}")
            print(f"STDERR: {result.stderr}")
            sys.exit(1)
            
    except Exception as e:
        print(f"Exception during local upscale: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
