import os
import sys
import subprocess
import webbrowser
import time
from pathlib import Path

def main():
    """
    Run the Synthograsizer V3 application
    """
    print("Starting Synthograsizer V3...")
    
    # Get the project root directory
    root_dir = Path(__file__).parent.absolute()
    
    # Check if the frontend build exists
    frontend_dist = root_dir / "frontend" / "dist"
    if not frontend_dist.exists():
        print("Frontend build not found. Please build the frontend first.")
        print("Run: cd frontend && npm run build")
        return
    
    # Start the backend server
    print("Starting backend server...")
    os.chdir(root_dir)
    
    # Use uvicorn to run the FastAPI app
    cmd = [sys.executable, "-m", "uvicorn", "app.main:app", "--reload", "--host", "0.0.0.0", "--port", "8000"]
    
    try:
        # Start the server process
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            universal_newlines=True,
            bufsize=1
        )
        
        # Wait a moment for the server to start
        time.sleep(2)
        
        # Open the browser
        print("Opening browser...")
        webbrowser.open("http://localhost:8000")
        
        # Print server output
        print("Server running at http://localhost:8000")
        print("Press Ctrl+C to stop")
        
        # Stream the output
        for line in process.stdout:
            print(line, end="")
            
    except KeyboardInterrupt:
        print("\nStopping server...")
        process.terminate()
        process.wait()
        print("Server stopped")
    except Exception as e:
        print(f"Error: {e}")
        if 'process' in locals():
            process.terminate()
            process.wait()

if __name__ == "__main__":
    main()
