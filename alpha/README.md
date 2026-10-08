# Shotwright alpha landing page

One static page: `index.html` and twelve images in `media/`.
The page is made for ZenaStudios and says that Shotwright is in alpha.
Open `index.html` through a local server. The images load by relative path.

## Refresh the screenshots

1. Build the app in a checkout, then run the capture from that checkout:

   ```powershell
   node site/alpha/capture.mjs . $env:TEMP\shotwright-landing-shots
   ```

   The window is 1600 x 1000 at scale factor 2, so each still is 3200 x 2002.
   The app runs off-screen with temp userData and Documents.

2. Cut the four page images with ffmpeg:

   ```powershell
   $s = "$env:TEMP\shotwright-landing-shots"; $m = "site\alpha\media"
   ffmpeg -y -i $s\hero-persp.png -vf scale=2400:-1:flags=lanczos -c:v libwebp -quality 84 $m\workspace.webp
   ffmpeg -y -i $s\diner-top.png -vf "crop=1984:1452:448:137,scale=1400:-1:flags=lanczos" -c:v libwebp -quality 84 $m\plan.webp
   ffmpeg -y -i $s\hero-persp.png -vf "crop=3200:402:0:1600,scale=2400:-1:flags=lanczos" -c:v libwebp -quality 86 $m\edit-track.webp
   ffmpeg -y -i $s\hero-prompt.png -vf "crop=763:1447:2437:142" -c:v libwebp -quality 86 $m\prompt.webp
   ```

   The crop numbers fit the layout of alpha-1. A layout change moves them.

3. The hero still hides labels and light gizmos (`overlays.labels` and `overlays.lights` off).
   The six `render-*.webp` stills look through a camera with all overlays off.
   Crop each look-through still with `crop=1852:1040:528:372`, then scale to 960 px.

4. Check the slate caption under the hero image. It names cut 5, CAM 5 and timecode 00:15.5.

## Refresh the animatic

The monitor plays `media/animatic.mp4`, the `sequence.mp4` of a Diner standoff packet.
Build the packet in the app (Packet tab, Build packet), then encode it with a short keyframe interval so scrubbing seeks fast:

```powershell
ffmpeg -i sequence.mp4 -vf scale=1280:-2 -c:v libx264 -crf 26 -g 8 -keyint_min 8 -pix_fmt yuv420p -an -movflags +faststart site\alpha\media\animatic.mp4
```

The shot briefs under the monitor come from the packet's `prompt.txt`, the `Shot N (a-b s):` lines.
The page loads the video as a blob, so it seeks even on a server without range requests.
