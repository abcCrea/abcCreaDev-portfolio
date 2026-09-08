(function () {
  var galleries = window.PROJECT_CAROUSEL_GALLERIES || {};
  var carousel = document.querySelector(".floating-carousel");
  var lanesRoot = document.querySelector("[data-carousel-lanes]");
  var cards = Array.prototype.slice.call(
    document.querySelectorAll(".project-card[data-project-id]")
  ).filter(function (card) {
    return galleries[card.dataset.projectId];
  });
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var activeIds = [];
  var focusedCard = null;
  var hoveredCard = null;

  if (!carousel || !lanesRoot || !cards.length) {
    return;
  }

  function getProject(card) {
    return {
      id: card.dataset.projectId,
      title: card.dataset.projectTitle || card.querySelector("h3").textContent.trim()
    };
  }

  function isCardVisible(card) {
    var rect = card.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight;
  }

  function sameIds(nextIds) {
    return (
      activeIds.length === nextIds.length &&
      activeIds.every(function (id, index) {
        return id === nextIds[index];
      })
    );
  }

  function sectionContainsViewportCenter(sectionId, centerY) {
    var section = document.getElementById(sectionId);
    if (!section) {
      return false;
    }

    var rect = section.getBoundingClientRect();
    return rect.top <= centerY && rect.bottom >= centerY;
  }

  function getCompactRowCards(baseCard) {
    if (window.innerWidth < 900 || !baseCard.classList.contains("compact-card")) {
      return [baseCard];
    }

    var baseRect = baseCard.getBoundingClientRect();
    var rowCards = cards.filter(function (card) {
      var rect = card.getBoundingClientRect();
      return (
        card.classList.contains("compact-card") &&
        card.parentElement === baseCard.parentElement &&
        isCardVisible(card) &&
        Math.abs(rect.top - baseRect.top) < 28
      );
    });

    return rowCards
      .sort(function (a, b) {
        return a.getBoundingClientRect().left - b.getBoundingClientRect().left;
      })
      .slice(0, 2);
  }

  function getCenteredCards() {
    var centerY = window.innerHeight * 0.52;
    var inProjectArea =
      sectionContainsViewportCenter("featured", centerY) ||
      sectionContainsViewportCenter("projects", centerY) ||
      sectionContainsViewportCenter("open-source", centerY);

    if (!inProjectArea) {
      return [];
    }

    var visibleCards = cards.filter(isCardVisible);
    if (!visibleCards.length) {
      return [];
    }

    var closest = visibleCards.reduce(function (best, card) {
      var rect = card.getBoundingClientRect();
      var distance = Math.abs(rect.top + rect.height / 2 - centerY);
      if (!best || distance < best.distance) {
        return { card: card, distance: distance };
      }
      return best;
    }, null).card;

    return getCompactRowCards(closest);
  }

  function getActiveCards() {
    if (
      focusedCard &&
      document.body.contains(focusedCard) &&
      focusedCard.contains(document.activeElement)
    ) {
      return [focusedCard];
    }

    if (hoveredCard && isCardVisible(hoveredCard)) {
      return [hoveredCard];
    }

    return getCenteredCards();
  }

  function renderLane(project) {
    var files = galleries[project.id] || [];
    if (!files.length) {
      return null;
    }

    var lane = document.createElement("section");
    var title = document.createElement("h3");
    var track = document.createElement("div");

    lane.className = "carousel-lane";
    lane.dataset.projectId = project.id;

    title.className = "carousel-title";
    title.textContent = project.title;

    track.className = "carousel-track";
    track.tabIndex = 0;
    track.setAttribute("aria-label", project.title + " images");
    track.dataset.activeIndex = "0";

    files.forEach(function (file, index) {
      var button = document.createElement("button");
      var image = document.createElement("img");
      var imageNumber = index + 1;

      button.className = "carousel-image-button";
      button.type = "button";
      button.dataset.imageIndex = index;
      button.setAttribute(
        "aria-label",
        "Center image " + imageNumber + " for " + project.title
      );

      image.src = "assets/project-carousels/" + project.id + "/" + file;
      image.alt = project.title + " image " + imageNumber;
      image.draggable = false;

      button.appendChild(image);
      track.appendChild(button);
    });

    lane.appendChild(title);
    lane.appendChild(track);
    return lane;
  }

  function wrapIndex(index, total) {
    return ((index % total) + total) % total;
  }

  function getCircularOffset(index, activeIndex, total) {
    var offset = index - activeIndex;
    var half = total / 2;

    if (offset > half) {
      offset -= total;
    } else if (offset < -half) {
      offset += total;
    }

    return offset;
  }

  function setTrackIndex(track, nextIndex) {
    var buttons = Array.prototype.slice.call(
      track.querySelectorAll(".carousel-image-button")
    );
    var total = buttons.length;
    var activeIndex = wrapIndex(nextIndex, total);
    var slotSpacing = Math.min(Math.max(track.clientWidth * 0.28, 150), 280);

    buttons.forEach(function (button) {
      var imageIndex = Number(button.dataset.imageIndex);
      var slot = getCircularOffset(imageIndex, activeIndex, total);
      var distance = Math.abs(slot);
      var visibleDistance = Math.min(distance, 2);

      button.style.setProperty("--slot", slot);
      button.style.setProperty("--slot-offset", slot * slotSpacing + "px");
      button.style.setProperty("--distance", distance);
      button.style.setProperty("--image-scale", 1 - visibleDistance * 0.08);
      button.style.setProperty("--image-opacity", Math.max(0.16, 1 - distance * 0.2));
      button.style.zIndex = String(10 - distance);
      button.classList.toggle("is-centered", imageIndex === activeIndex);
      button.classList.toggle("is-nearby", distance <= 2);
      button.setAttribute("aria-pressed", imageIndex === activeIndex ? "true" : "false");
    });

    track.dataset.activeIndex = String(activeIndex);
  }

  function moveTrack(track, direction) {
    var activeIndex = Number(track.dataset.activeIndex || 0);
    setTrackIndex(track, activeIndex + direction);
  }

  function getPressedImageButton(event) {
    if (!event.target.closest) {
      return null;
    }

    return event.target.closest(".carousel-image-button");
  }

  function bindLaneEvents() {
    Array.prototype.slice.call(
      lanesRoot.querySelectorAll(".carousel-track")
      ).forEach(function (track) {
      var pointerStartX = 0;
      var pointerId = null;
      var pressedButton = null;

      track.addEventListener(
        "wheel",
        function (event) {
          var delta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
            ? event.deltaX
            : event.deltaY;
          var now = performance.now();
          var lastWheelAt = Number(track.dataset.lastWheelAt || 0);

          event.preventDefault();

          if (Math.abs(delta) > 4 && now - lastWheelAt > 180) {
            moveTrack(track, delta > 0 ? 1 : -1);
            track.dataset.lastWheelAt = String(now);
          }
        },
        { passive: false }
      );

      track.addEventListener("keydown", function (event) {
        if (event.key === "ArrowRight") {
          event.preventDefault();
          moveTrack(track, 1);
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          moveTrack(track, -1);
        }
      });

      track.addEventListener("pointerdown", function (event) {
        pointerStartX = event.clientX;
        pointerId = event.pointerId;
        pressedButton = getPressedImageButton(event);
        if (track.setPointerCapture) {
          track.setPointerCapture(pointerId);
        }
      });

      track.addEventListener("pointerup", function (event) {
        var dragDistance = event.clientX - pointerStartX;

        if (pointerId !== null && track.releasePointerCapture) {
          track.releasePointerCapture(pointerId);
        }

        pointerId = null;

        if (Math.abs(dragDistance) > 34) {
          track.dataset.wasDragging = "true";
          moveTrack(track, dragDistance < 0 ? 1 : -1);
        } else if (pressedButton && track.contains(pressedButton)) {
          setTrackIndex(track, Number(pressedButton.dataset.imageIndex));
        }

        pressedButton = null;
      });

      track.addEventListener("pointercancel", function () {
        pointerId = null;
        pressedButton = null;
      });

      Array.prototype.slice.call(
        track.querySelectorAll(".carousel-image-button")
      ).forEach(function (button) {
        button.addEventListener("click", function () {
          if (track.dataset.wasDragging === "true") {
            track.dataset.wasDragging = "false";
            return;
          }

          setTrackIndex(track, Number(button.dataset.imageIndex));
        });
      });

      setTrackIndex(track, Number(track.dataset.activeIndex || 0));
    });
  }

  function setActiveCards(nextCards) {
    var nextIds = nextCards.map(function (card) {
      return card.dataset.projectId;
    });

    if (sameIds(nextIds)) {
      return;
    }

    activeIds = nextIds;
    lanesRoot.textContent = "";
    carousel.classList.toggle("is-visible", activeIds.length > 0);
    carousel.classList.toggle("is-split", activeIds.length > 1);
    carousel.setAttribute("aria-hidden", activeIds.length ? "false" : "true");

    nextCards.forEach(function (card) {
      var lane = renderLane(getProject(card));
      if (lane) {
        lanesRoot.appendChild(lane);
      }
    });

    bindLaneEvents();
  }

  function updateActiveCarousel() {
    setActiveCards(getActiveCards());
  }

  function refreshActiveTracks() {
    Array.prototype.slice.call(
      lanesRoot.querySelectorAll(".carousel-track")
    ).forEach(function (track) {
      setTrackIndex(track, Number(track.dataset.activeIndex || 0));
    });
  }

  cards.forEach(function (card) {
    card.addEventListener("focusin", function () {
      focusedCard = card;
      updateActiveCarousel();
    });

    card.addEventListener("focusout", function () {
      window.setTimeout(function () {
        if (!card.contains(document.activeElement)) {
          focusedCard = null;
          updateActiveCarousel();
        }
      }, 0);
    });

    card.addEventListener("pointerenter", function () {
      hoveredCard = card;
      updateActiveCarousel();
    });

    card.addEventListener("pointerleave", function () {
      if (hoveredCard === card) {
        hoveredCard = null;
        updateActiveCarousel();
      }
    });
  });

  window.addEventListener("scroll", updateActiveCarousel, { passive: true });
  window.addEventListener("resize", function () {
    updateActiveCarousel();
    refreshActiveTracks();
  });
  window.addEventListener("load", updateActiveCarousel);
  if (reduceMotion.addEventListener) {
    reduceMotion.addEventListener("change", updateActiveCarousel);
  } else if (reduceMotion.addListener) {
    reduceMotion.addListener(updateActiveCarousel);
  }

  updateActiveCarousel();
})();
