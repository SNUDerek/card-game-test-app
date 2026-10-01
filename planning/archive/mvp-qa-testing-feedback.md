
# mvp qa testing

okay, it's looking good now, have some thoughts on what'd make it immediately more user friendly for testing:



## functional (tweaks/bugs)

- on the card catalog, instead of only images in two columns, can we make it single column, with image on left and id and name on right? we can keep the click-and-drag only for the image. we should be able to scroll (do not always assume 16 cards).

- i think the magnification is not needed all the time, can we:
    a. turn it into an option in the right-click menu? (where tap appears)
    b. reduce the scaling from 4x to 2x?
    c. draw it over the source card, and have it disappear when the mouse is moved off it?

- would like some way to see others' cursor related info:
    - would prefer 'live' cursors
    - if too heavy, then at least one of the following:
        - 'ping' when double-clicking off card
        - simple pen feature that fades (like google meet)



## functional (new features)

- simple password prompt (set via config?) before accessing create/join page just to discourage the curious? -- don't need or want more advanced auth right now.
- in stack right-click menu, enable 'shuffle' feature



## (purely) visual

- when you release the card after clicking-and-dragging to move, sometimes it does a little 'bounce', is there a way to stop that?
- can we make the card border darker (black?), and add small amount of padding around borders
- 