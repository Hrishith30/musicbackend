from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from ytmusicapi import YTMusic
import yt_dlp
import os

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Unofficial YouTube Music API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Static files handled by GitHub Pages
# app.mount("/static", StaticFiles(directory="static"), name="static")


yt = YTMusic()

@app.get("/")
def read_root():
    return {"status": "online", "message": "Unofficial YouTube Music API is running"}


@app.get("/search")
def search(query: str, filter: str = Query(None, enum=["songs", "videos", "albums", "artists", "playlists", "community_playlists", "featured_playlists", "uploads"])):
    try:
        results = yt.search(query, filter=filter)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/home_content")
def get_home_content():
    try:
        # Note: get_home() often requires authentication for personalized results.
        # Without auth, it might return a standard home or fail. 
        # We'll try to return whatever it gives.
        home = yt.get_home()
        return home
    except Exception as e:
        # If it fails, return an empty list or handle gracefully
        print(f"Error fetching home: {e}")
        return []

@app.get("/artist/{artist_id}")
def get_artist(artist_id: str):
    try:
        artist = yt.get_artist(artist_id)
        return artist
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/album/{album_id}")
def get_album(album_id: str):
    try:
        album = yt.get_album(album_id)
        return album
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/playlist/{playlist_id}")
def get_playlist(playlist_id: str):
    try:
        playlist = yt.get_playlist(playlist_id)
        return playlist
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/radio/{video_id}")
def get_radio(video_id: str):
    try:
        # get_watch_playlist returns a dict with 'tracks', 'playlistId', etc.
        # We just want the tracks.
        watch_playlist = yt.get_watch_playlist(videoId=video_id, limit=20)
        return watch_playlist
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/play/{video_id}")
def get_stream_url(video_id: str):
    try:
        ydl_opts = {
            'format': 'bestaudio/best',
            'quiet': True,
            'no_warnings': True,
            'nocheckcertificate': True,
            'user_agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
            'extractor_args': {
                'youtube': {
                    'player_client': ['ios', 'web', 'android'],
                    'player_skip': ['webpage', 'configs']
                }
            },
            'http_headers': {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-us,en;q=0.5',
                'Sec-Fetch-Mode': 'navigate',
            }
        }

        # Use cookies to bypass bot detection
        # Priority 1: Environment Variable (Safe for public repos)
        # Priority 2: cookies.txt file (Simple local use)
        cookies_content = os.getenv("YOUTUBE_COOKIES")
        if cookies_content:
            temp_cookies_path = "/tmp/cookies.txt" if os.name != 'nt' else "temp_cookies.txt"
            with open(temp_cookies_path, "w", encoding="utf-8") as f:
                f.write(cookies_content)
            ydl_opts['cookiefile'] = temp_cookies_path
            print("Using cookies from environment variable")
        elif os.path.exists("cookies.txt"):
            ydl_opts['cookiefile'] = 'cookies.txt'
            print("Using cookies.txt for authentication")

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            try:
                info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
                if not info or 'url' not in info:
                    raise HTTPException(status_code=404, detail="Stream URL not found in extraction info.")
                return {"url": info['url'], "title": info.get('title'), "duration": info.get('duration')}
            except Exception as e:
                # Log detailed error for debugging purposes (Vercel logs)
                print(f"Extraction error for {video_id}: {str(e)}")
                raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
