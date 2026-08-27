// modules/mk-damage-numbers/scripts/bridge.js
// Foundry VTT v13-v14 + Shadowdark v4+
// Replaces Shadowdark's native HP scrolling text with standalone bouncing text.

const MODULE_ID = "mk-damage-numbers";
const MODULE_VERSION = "2.0.2";

const DEFAULT_FONT = "Signika";
const DEFAULT_FONT_SIZE = 48;
const DEFAULT_ORIGIN_OFFSET = -0.4;
const DEFAULT_ANIMATION_DURATION_SECONDS = 1.7;
const MIN_ANIMATION_DURATION_SECONDS = 0.5;
const MAX_ANIMATION_DURATION_SECONDS = 5;
const STRESS_GAIN_FILL = 0x000000;
const STRESS_GAIN_STROKE = 0xffffff;
const STRESS_LOSS_FILL = 0xffffff;
const STRESS_LOSS_STROKE = 0x000000;

const SHADOWDARK_PATCH_FLAG = Symbol.for(`${MODULE_ID}.shadowdarkHpAnimationPatched`);
const HP_ANIMATION_CALL_COUNT = Symbol.for(`${MODULE_ID}.hpAnimationCallCount`);

const ACTIVE_ANIMATIONS = new Set();
const FRAME_MS = 1000 / 60;

/* ---------------------------------------- */
/*  Init: Settings                          */
/* ---------------------------------------- */

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | v${MODULE_VERSION} | init`);

  game.settings.register(MODULE_ID, "fontFamily", {
    name: "Font Family",
    hint: "Font family used for bouncing damage and healing numbers. Lists fonts available in Foundry.",
    scope: "world",
    config: true,
    type: String,
    default: DEFAULT_FONT,
    choices: getAvailableFontChoices()
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

  game.settings.register(MODULE_ID, "animationDuration", {
    name: "Animation Duration",
    hint: "How long each damage or healing number remains visible, in seconds. Fading begins halfway through.",
    scope: "world",
    config: true,
    type: Number,
    default: DEFAULT_ANIMATION_DURATION_SECONDS,
    range: {
      min: MIN_ANIMATION_DURATION_SECONDS,
      max: MAX_ANIMATION_DURATION_SECONDS,
      step: 0.1
    }
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

function getAvailableFontChoices() {
  const FontConfigClass = foundry.applications?.settings?.menus?.FontConfig
    ?? globalThis.FontConfig;
  const availableChoices = FontConfigClass?.getAvailableFontChoices?.() ?? {};

  return {
    [DEFAULT_FONT]: DEFAULT_FONT,
    ...availableChoices
  };
}

function refreshAvailableFontChoices() {
  const setting = game.settings.settings.get(`${MODULE_ID}.fontFamily`);
  if (!setting) return;

  setting.choices = getAvailableFontChoices();
}

/* ---------------------------------------- */
/*  Ready: Install Overrides                */
/* ---------------------------------------- */

Hooks.once("ready", () => {
  refreshAvailableFontChoices();

  if (game.system.id !== "shadowdark") return;

  installShadowdarkHpAnimationReplacement();
});

Hooks.on("mkStressChanged", handleStressChanged);

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

function createBouncingNumber(token, displayText, fill, stroke = 0x000000) {
  const TextClass = foundry.canvas?.containers?.PreciseText;
  const ticker = canvas?.app?.ticker;

  if (!TextClass || !ticker || !canvas?.interface || !token?.center) {
    console.error(`${MODULE_ID} | Canvas text animation API was not found.`);
    return false;
  }

  const configuredSize = Number(game.settings.get(MODULE_ID, "fontSize"));
  const fontSize = Number.isFinite(configuredSize) && configuredSize > 0
    ? configuredSize
    : DEFAULT_FONT_SIZE;

  const configuredOffset = Number(game.settings.get(MODULE_ID, "originOffset"));
  const offsetFactor = Number.isFinite(configuredOffset)
    ? configuredOffset
    : DEFAULT_ORIGIN_OFFSET;

  const configuredDuration = Number(
    game.settings.get(MODULE_ID, "animationDuration")
  );
  const durationSeconds = Number.isFinite(configuredDuration)
    ? Math.min(
        MAX_ANIMATION_DURATION_SECONDS,
        Math.max(MIN_ANIMATION_DURATION_SECONDS, configuredDuration)
      )
    : DEFAULT_ANIMATION_DURATION_SECONDS;
  const animationDurationMs = durationSeconds * 1000;
  const fadeStartMs = animationDurationMs / 2;

  const fontFamily = String(
    game.settings.get(MODULE_ID, "fontFamily") || DEFAULT_FONT
  );

  const text = new TextClass(displayText, {
    align: "center",
    dropShadow: true,
    fill,
    fontFamily,
    fontSize,
    fontWeight: "bold",
    stroke,
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
    else if (elapsed > fadeStartMs) {
      const fadeProgress = (elapsed - fadeStartMs)
        / (animationDurationMs - fadeStartMs);
      text.alpha = Math.max(0, 1 - fadeProgress);
      text.scale.set(Math.max(0.75, 1 - (fadeProgress * 0.15)));
    }

    if (elapsed >= animationDurationMs || text.alpha <= 0) cleanup();
  };

  ACTIVE_ANIMATIONS.add(cleanup);
  ticker.add(tick);
  return true;
}

function createBouncingDamageNumber(token, delta, color) {
  const value = Math.abs(Math.trunc(delta));
  return createBouncingNumber(token, String(value), color);
}

function createBouncingStressNumber(token, delta) {
  const value = Math.abs(Math.trunc(delta));
  const isGain = delta > 0;
  const sign = isGain ? "+" : "-";
  const fill = isGain ? STRESS_GAIN_FILL : STRESS_LOSS_FILL;
  const stroke = isGain ? STRESS_GAIN_STROKE : STRESS_LOSS_STROKE;

  return createBouncingNumber(token, `${sign}${value}`, fill, stroke);
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
      const tokens = getActiveActorTokens(this);

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

function getActiveActorTokens(actor) {
  if (actor?.isToken) return actor.token ? [actor.token] : [];
  return actor?.getActiveTokens?.(true, true) ?? [];
}

function handleStressChanged(actor, newStress, oldStress) {
  const currentStress = Number(newStress);
  const previousStress = Number(oldStress);
  const delta = currentStress - previousStress;

  if (
    !Number.isFinite(currentStress) ||
    !Number.isFinite(previousStress) ||
    !Number.isFinite(delta) ||
    delta === 0
  ) {
    return;
  }

  try {
    let accepted = false;

    for (const tokenDoc of getActiveActorTokens(actor)) {
      const token = tokenDoc?.object;
      if (!token) continue;

      accepted = createBouncingStressNumber(token, delta) || accepted;
    }

    // MK Stress uses a false hook result to skip its fallback scrolling text.
    if (accepted) return false;
  }
  catch (error) {
    console.error(`${MODULE_ID} | MK Stress animation error:`, error);
  }
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
