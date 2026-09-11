# Media fixtures

`media-recorder-fragmented.mp4` was recorded on 2026-09-10 by headless Edge using its synthetic camera and audio device. It contains no personal footage. SHA-256: `a16f6f77ddf5556d65e47f6a456355f07d3f83d002da2cd040686263769977ef`.

The browser writes a zero-duration `mvhd` and real sample timing in MP4 fragments. It reproduces a valid camera upload that previously failed integrity validation. Tests stream it across small chunk boundaries and reject modified timelines, excessive sample counts, missing fragments, and truncation.
