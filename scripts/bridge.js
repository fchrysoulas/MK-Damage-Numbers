// modules/mk-damage-numbers/scripts/bridge.js
// Foundry VTT v13 + Shadowdark v4+
// Replaces Shadowdark's native HP scrolling text with RPG Damage Numbers.

import { DamageNumberHelpers } from "/modules/damage-numbers/scripts/helpers.js";
import { DamageNumber } from "/modules/damage-numbers/scripts/DamageNumbers.js";

const MODULE_ID = "mk-damage-numbers";
const MODULE_VERSION = "1.1.0";

const DEFAULT_FONT = "Signika";
const DEFAULT_FONT_SIZE = 48;
const DEFAULT_ORIGIN_OFFSET = -0.4;

const STYLE_PATCH_FLAG = Symbol.for(`${MODULE_ID}.damageNumberStylePatched`);
const SHADOWDARK_PATCH_FLAG = Symbol.for(`${MODULE_ID}.shadowdarkHpAnimationPatched`);

/* ---------------------------------------- */
/*  Init: Settings                          */
/* ---------------------------------------- */

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | v${MODULE_VERSION} | init`);

  game.settings.register(MODULE_ID, "fontFamily", {
    name: "Font Family",
    hint: "Font family used for RPG damage and healing numbers.",
    scope: "world",
    config: true,
    type: String,
    default: DEFAULT_FONT,
    restricted: true
  });

  game.settings.register(MODULE_ID, "fontSize", {
    name: "Font Size",
    hint: "Fixed font size in pixels for RPG damage and healing numbers.",
    scope: "world",
    config: true,
    type: Number,
    default: DEFAULT_FONT_SIZE,
    range: { min: 12, max: 128, step: 1 },
    restricted: true
  });

  game.settings.register(MODULE_ID, "originOffset", {
    name: "Vertical Origin Offset",
    hint: "Starting height relative to token height. Negative values move the numbers higher.",
    scope: "world",
    config: true,
    type: Number,
    default: DEFAULT_ORIGIN_OFFSET,
    range: { min: -1, max: 1, step: 0.05 },
    restricted: true
  });

  // Compatibility for versions of RPG Damage Numbers whose core scrolling-text
  // wrapper expects DamageNumberHelpers to exist as a global identifier.
  globalThis.DamageNumberHelpers = DamageNumberHelpers;
});

/* ---------------------------------------- */
/*  Ready: Install Overrides                */
/* ---------------------------------------- */

Hooks.once("ready", () => {
  if (game.system.id !== "shadowdark") return;

  installDamageNumberStyleOverride();
  installShadowdarkHpAnimationReplacement();
});

/* ---------------------------------------- */
/*  RPG Damage Numbers Style                */
/* ---------------------------------------- */

function installDamageNumberStyleOverride() {
  const proto = DamageNumber?.prototype;

  if (!proto) {
    console.error(`${MODULE_ID} | DamageNumber prototype was not found.`);
    return;
  }

  if (proto[STYLE_PATCH_FLAG]) return;

  if (typeof proto.getText !== "function") {
    console.error(`${MODULE_ID} | DamageNumber.getText() was not found.`);
    return;
  }

  const originalGetText = proto.getText;

  proto.getText = function (...args) {
    const textSprite = originalGetText.apply(this, args);

    if (textSprite?.style) {
      const fontFamily = String(
        game.settings.get(MODULE_ID, "fontFamily") || DEFAULT_FONT
      );

      const configuredSize = Number(
        game.settings.get(MODULE_ID, "fontSize")
      );

      const fontSize = Number.isFinite(configuredSize) && configuredSize > 0
        ? configuredSize
        : DEFAULT_FONT_SIZE;

      textSprite.style.fontFamily = fontFamily;
      textSprite.style.fontSize = fontSize;

      // PIXI text objects need to be marked dirty after changing their style.
      if ("dirty" in textSprite) textSprite.dirty = true;
      if (typeof textSprite.updateText === "function") textSprite.updateText();
    }

    return textSprite;
  };

  if (typeof proto.animate === "function") {
    const originalAnimate = proto.animate;

    proto.animate = async function (...args) {
      try {
        if (this.token && this.sprite) {
          const configuredOffset = Number(
            game.settings.get(MODULE_ID, "originOffset")
          );

          const offsetFactor = Number.isFinite(configuredOffset)
            ? configuredOffset
            : DEFAULT_ORIGIN_OFFSET;

          const tokenHeightPx = getTokenHeightPx(this.token);
          this.sprite.y += tokenHeightPx * offsetFactor;
        }
      }
      catch (error) {
        console.error(`${MODULE_ID} | Failed to apply origin offset.`, error);
      }

      return originalAnimate.apply(this, args);
    };
  }

  Object.defineProperty(proto, STYLE_PATCH_FLAG, {
    value: true,
    configurable: false,
    enumerable: false
  });

  console.log(`${MODULE_ID} | RPG Damage Numbers style override installed.`);
}

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
      `This bridge expects Shadowdark v4+ on Foundry VTT v13.`
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
   *
   * RPG Damage Numbers simple helper convention:
   *   healthDiff > 0 -> damage
   *   healthDiff < 0 -> healing
   *
   * Therefore healthDiff = -delta.
   */
  proto._animateHpChange = function (delta) {
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

        // Completely replace Shadowdark's native createScrollingText() call
        // with the RPG Damage Numbers animation.
        DamageNumberHelpers.executeSimpleDamageNumbers(
          tokenDoc.id,
          -delta
        );
      }
    }
    catch (error) {
      console.error(`${MODULE_ID} | Shadowdark HP animation replacement error:`, error);
    }
  };

  // Shadowdark v4 currently gates its native _animateHpChange call with a
  // truthy HP-value check, so an update that lands exactly on 0 HP can skip
  // the animation. Preserve the system workflow, but fill that one gap so a
  // lethal hit still gets an RPG damage number.
  if (typeof proto._onUpdate === "function") {
    const originalOnUpdate = proto._onUpdate;

    proto._onUpdate = async function (data, options, userId) {
      const result = await originalOnUpdate.call(this, data, options, userId);

      const previousHp = Number(options?.shadowdark?.prevHpValue);
      const currentHp = Number(this.system?.attributes?.hp?.value);

      if (
        Number.isFinite(previousHp) &&
        Number.isFinite(currentHp) &&
        currentHp === 0 &&
        previousHp !== 0
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
    `${MODULE_ID} | Shadowdark native HP scrolling text replaced with RPG Damage Numbers.`
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

    ring.flashColor(Color.from(colorValue), animation);
  }
  catch (error) {
    // Ring flashing is cosmetic. Do not prevent damage numbers if it fails.
    console.warn(`${MODULE_ID} | Dynamic Token Ring flash failed.`, error);
  }
}
