# Penny Offline mark

The new native mark keeps Penny's copper coin and letter P, with simple geometry that remains legible at launcher size. It removes the legacy chat-bubble silhouette because local personal finance is the primary product. The green field is `#173F36`, copper `#E7B38B`, and inset line `#F4D7B8`.

`penny-offline-icon.svg` is the editable, opaque 1024-point source. `penny-offline-icon.png` is its 1024 px RGB export. `penny-offline-foreground.svg` provides a transparent foreground for system icon composition; the background is a separate solid green field. The mark fits within the central Android adaptive-icon safe region. Native owners generate or integrate platform asset catalogs and adaptive/monochrome resources; a source asset alone is not evidence of launcher integration.

These are original vector paths created in this repository, without fonts, downloaded stock or generated raster content. The existing Flutter/web assets are preserved. To reproduce the PNG with the repository's installed Sharp dependency:

```sh
node --input-type=module -e "import sharp from 'sharp'; await sharp('assets/offline/penny-offline-icon.svg').removeAlpha().png().toFile('assets/offline/penny-offline-icon.png')"
```

Do not bake rounded app-icon corners or simulated Liquid Glass reflections into the source; the operating system applies its own presentation.
