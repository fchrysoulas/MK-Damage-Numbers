// modules/mk-damage-numbers/scripts/bridge.js
// Foundry VTT v13-v14 + Shadowdark v4+
// Replaces Shadowdark's native HP scrolling text with standalone bouncing text.

const MODULE_ID = "mk-damage-numbers";
const MODULE_VERSION = "2.0.0";

const DEFAULT_FONT = "Signika";
const DEFAULT_FONT_SIZE = 48;
const DEFAULT_ORIGIN_OFFSET = -0.4;

const SHADOWDARK_PATCH_FLAG = Symbol.for(`${MODULE_ID}.shadowdarkHpAnimationPatched`);
const HP_ANIMATION_CALL_COUNT = Symbol.for(`${MODULE_ID}.hpAnimationCallCount`);

const ACTIVE_ANIMATIONS = new Set();
const FRAME_MS = 1000 / 60;
const ANIMATION_DURATION_MS = 1700;
const FADE_START_MS = 850;

/* ---------------------------------------- */
/*  Init: Settings                          */
/* ---------------------------------------- */

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | v${MODULE_VERSION} | init`);

  game.settings.register(MODULE_ID, "fontFamily", {
    name: "Font Family",
    hint: "Font family used for bouncing damage and healing numbers.",
    scope: "world",
    config: true,
    type: String,
    default: DEFAULT_FONT
  });

  game.settings.register(MODULE_ID, "fontSize", {
    name: "Font Size",
    hint: "Fixed font size in pixels for bouncing damage and healing numbers.",
    scope: "world",
    config: true,
    type: Number,
    default: DEFAULT_FONT_SIZE,
    range: { min: 12, max: 128, step: 1 }
  });

  game.settings.register(MODULE_ID, "originOffset", {
    name: "Vertical Origin Offset",
    hint: "Starting height relative to token height. Negative values move the numbers higher.",
    scope: "world",
    config: true,
    type: Number,
    default: DEFAULT_ORIGIN_OFFSET,
    range: { min: -1, max: 1, step: 0.05 }
  });
});

/* ---------------------------------------- */
/*  Ready: Install Overrides                */
/* ---------------------------------------- */

Hooks.once("ready", () => {
  if (game.system.id !== "shadowdark") return;

  installShadowdarkHpAnimationReplacement();
});

function getTokenHeightPx(token) {
  const placeableHeight = Number(token?.h);
  if (Number.isFinite(placeableHeight) && placeableHeight > 0) {
    return placeableHeight;
  }

  const gridSize = Number(canvas?.grid?.size) || 100;
  const documentHeight = Number(token?.document?.height) || 1;
  return documentHeight * gridSize;
}

/* ---------------------------------------- */
/*  Standalone Bouncing Text                */
/* ---------------------------------------- */

function createBouncingDamageNumber(token, delta, color) {
  const TextClass = foundry.canvas?.containers?.PreciseText;
  const ticker = canvas?.app?.ticker;

  if (!TextClass || !ticker || !canvas?.interface || !token?.center) {
    console.error(`${MODULE_ID} | Canvas text animation API was not found.`);
    return;
  }

  const configuredSize = Number(game.settings.get(MODULE_ID, "fontSize"));
  const fontSize = Number.isFinite(configuredSize) && configuredSize > 0
    ? configuredSize
    : DEFAULT_FONT_SIZE;

  const configuredOffset = Number(game.settings.get(MODULE_ID, "originOffset"));
  const offsetFactor = Number.isFinite(configuredOffset)
    ? configuredOffset
    : DEFAULT_ORIGIN_OFFSET;

  const fontFamily = String(
    game.settings.get(MODULE_ID, "fontFamily") || DEFAULT_FONT
  );

  const value = Math.abs(Math.trunc(delta));
  const text = new TextClass(String(value), {
    align: "center",
    dropShadow: true,
    fill: color,
    fontFamily,
    fontSize,
    fontWeight: "bold",
    stroke: 0x000000,
    strokeThickness: Math.max(3, Math.round(fontSize / 12))
  });

  text.anchor.set(0.5, 0.5);
  text.zIndex = CONFIG.Canvas?.groups?.interface?.zIndexScrollingText ?? 0;

  const tokenHeight = getTokenHeightPx(token);
  const startX = Number(token.center.x);
  const startY = Number(token.center.y) + (tokenHeight * offsetFactor);
  const floorY = startY + Math.min(tokenHeight * 0.15, fontSize * 0.5);

  text.position.set(startX, startY);
  text.scale.set(0.65);
  canvas.interface.addChild(text);

  let elapsed = 0;
  let velocityX = (Math.random() - 0.5) * 4.2;
  let velocityY = -(4.6 + (Math.random() * 1.8));
  const gravity = 0.15 + (Math.random() * 0.035);
  let bouncesRemaining = 1;
  let cleaned = false;

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    ticker.remove(tick);
    ACTIVE_ANIMATIONS.delete(cleanup);
    if (text.parent) text.parent.removeChild(text);
    if (!text.destroyed) text.destroy();
  };

  const tick = () => {
    if (!canvas?.ready || text.destroyed || !text.parent) {
      cleanup();
      return;
    }

    const deltaMs = Number(ticker.deltaMS) || FRAME_MS;
    const frameDelta = Math.min(deltaMs / FRAME_MS, 3);
    elapsed += deltaMs;

    velocityY += gravity * frameDelta;
    text.x += velocityX * frameDelta;
    text.y += velocityY * frameDelta;

    if (bouncesRemaining > 0 && velocityY > 0 && text.y >= floorY) {
      text.y = floorY;
      velocityY = -(2.2 + (Math.random() * 0.7));
      velocityX *= 0.65;
      bouncesRemaining -= 1;
    }

    if (elapsed < 120) {
      const progress = elapsed / 120;
      text.scale.set(0.65 + (0.5 * progress));
    }
    else if (elapsed < 260) {
      const progress = (elapsed - 120) / 140;
      text.scale.set(1.15 - (0.15 * progress));
    }
    else if (elapsed > FADE_START_MS) {
      const fadeProgress = (elapsed - FADE_START_MS)
        / (ANIMATION_DURATION_MS - FADE_START_MS);
      text.alpha = Math.max(0, 1 - fadeProgress);
      text.scale.set(Math.max(0.75, 1 - (fadeProgress * 0.15)));
    }

    if (elapsed >= ANIMATION_DURATION_MS || text.alpha <= 0) cleanup();
  };

  ACTIVE_ANIMATIONS.add(cleanup);
  ticker.add(tick);
}

Hooks.on("canvasTearDown", () => {
  for (const cleanup of Array.from(ACTIVE_ANIMATIONS)) cleanup();
});

/* ---------------------------------------- */
/*  Shadowdark HP Animation Replacement     */
/* ---------------------------------------- */

function installShadowdarkHpAnimationReplacement() {
  const ActorClass = CONFIG.Actor?.documentClass;
  const proto = ActorClass?.prototype;

  if (!proto) {
    console.error(`${MODULE_ID} | Shadowdark Actor document class was not found.`);
    return;
  }

  if (proto[SHADOWDARK_PATCH_FLAG]) return;

  if (typeof proto._animateHpChange !== "function") {
    console.error(
      `${MODULE_ID} | Shadowdark _animateHpChange() was not found. ` +
      `This bridge expects Shadowdark v4+ on Foundry VTT v13-v14.`
    );
    return;
  }

  /*
   * Shadowdark v4 calls _animateHpChange(delta) from ActorSD._onUpdate.
   * _onUpdate is a post-update workflow and Foundry executes it on all
   * connected clients. Replacing this method therefore gives us the same
   * synchronization as Shadowdark's native HP animation without a second
   * custom socket event.
   *
   * Shadowdark delta convention:
   *   delta < 0 -> damage
   *   delta > 0 -> healing
   */
  proto._animateHpChange = function (delta) {
    this[HP_ANIMATION_CALL_COUNT] = (this[HP_ANIMATION_CALL_COUNT] ?? 0) + 1;

    if (!Number.isFinite(delta) || delta === 0) return;

    // Preserve Shadowdark's own Animate HP Change world setting.
    if (!game.settings.get("shadowdark", "animateHpChange")) return;

    try {
      const isDamage = delta < 0;
      const tokens = this.isToken
        ? [this.token]
        : this.getActiveTokens(true, true);

      for (const tokenDoc of tokens) {
        if (!tokenDoc?.object) continue;

        // Preserve Shadowdark's behavior: do not animate defeated tokens.
        if (
          tokenDoc.hasStatusEffect?.(CONFIG.specialStatusEffects.DEFEATED)
        ) {
          continue;
        }

        // Preserve Shadowdark's Dynamic Token Ring flash.
        flashTokenRing(tokenDoc, isDamage);

        const color = isDamage
          ? CONFIG.SHADOWDARK?.TOKEN_HP_COLORS?.damage ?? 0xffffff
          : CONFIG.SHADOWDARK?.TOKEN_HP_COLORS?.healing ?? 0x00ff00;

        createBouncingDamageNumber(tokenDoc.object, delta, color);
      }
    }
    catch (error) {
      console.error(`${MODULE_ID} | Shadowdark HP animation replacement error:`, error);
    }
  };

  // Shadowdark v4 currently gates its native _animateHpChange call with a
  // truthy HP-value check, so an update that lands exactly on 0 HP can skip
  // the animation. Preserve the system workflow, but fill that one gap so a
  // lethal hit still gets a bouncing damage number.
  if (typeof proto._onUpdate === "function") {
    const originalOnUpdate = proto._onUpdate;

    proto._onUpdate = async function (data, options, userId) {
      const animationCallsBefore = this[HP_ANIMATION_CALL_COUNT] ?? 0;
      const result = await originalOnUpdate.call(this, data, options, userId);

      const previousHp = Number(options?.shadowdark?.prevHpValue);
      const currentHp = Number(this.system?.attributes?.hp?.value);

      if (
        Number.isFinite(previousHp) &&
        Number.isFinite(currentHp) &&
        currentHp === 0 &&
        previousHp !== 0 &&
        (this[HP_ANIMATION_CALL_COUNT] ?? 0) === animationCallsBefore
      ) {
        this._animateHpChange(currentHp - previousHp);
      }

      return result;
    };
  }

  Object.defineProperty(proto, SHADOWDARK_PATCH_FLAG, {
    value: true,
    configurable: false,
    enumerable: false
  });

  console.log(
    `${MODULE_ID} | Shadowdark HP scrolling text replaced with standalone bouncing numbers.`
  );
}

function flashTokenRing(tokenDoc, isDamage) {
  try {
    const ring = tokenDoc?.object?.ring;
    if (!tokenDoc?.ring?.enabled || !ring) return;

    const colorValue = isDamage
      ? CONFIG.SHADOWDARK?.TOKEN_HP_COLORS?.damage
      : CONFIG.SHADOWDARK?.TOKEN_HP_COLORS?.healing;

    if (colorValue === undefined || colorValue === null) return;

    const animation = isDamage
      ? {
          duration: 500,
          easing: ring.constructor?.easeTwoPeaks
        }
      : {};

    ring.flashColor(foundry.utils.Color.from(colorValue), animation);
  }
  catch (error) {
    // Ring flashing is cosmetic. Do not prevent damage numbers if it fails.
    console.warn(`${MODULE_ID} | Dynamic Token Ring flash failed.`, error);
  }
}
