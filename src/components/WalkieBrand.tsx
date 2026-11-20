/**
 * Walkie Brand Components
 * Production vector masters for Walkie "Side Key" identity:
 * - Upright radio silhouette with antenna & finger cutouts
 * - Detached lime push-to-talk key (pressed & unpressed states)
 * - Custom geometric wordmark with matching lime pill over "i"
 */

import React from 'react';
import Svg, { G, Path, Rect } from 'react-native-svg';

export const BRAND_COLORS = {
  carbon: '#101011',
  chalk: '#EFEDE8',
  lime: '#C4F45B',
  darkChassis: '#14161A',
  oledBezel: '#0C0D10',
};

const MARK_BODY_PATH =
  'M26.9933 58.1533C28.9 41.9467 44.1533 30.5067 59.4067 30.5067H68.94C75.6133 30.5067 78.4733 28.6 80.38 20.9733L83.24 10.4867C85.1467 3.81333 89.9133 0.953334 96.5867 0.953334C104.213 0.953334 108.98 6.67333 108.98 14.3V40.04C113.747 46.7133 114.7 52.4333 114.7 60.06V114.4C114.7 130.607 103.26 142.047 87.0533 142.047H51.78C35.5733 142.047 26.9933 130.607 26.9933 116.307V106.773C31.76 102.96 33.6667 98.1933 33.6667 92.4733V74.36C33.6667 67.6867 31.76 62.92 26.9933 58.1533Z';

// Unpressed detached pill (x: 4.11 to 25.08)
const MARK_KEY_UNPRESSED =
  'M25.0867 69.5933C25.0867 63.8017 20.3916 59.1067 14.6 59.1067C8.80837 59.1067 4.11333 63.8017 4.11333 69.5933V95.3333C4.11333 101.125 8.80837 105.82 14.6 105.82C20.3916 105.82 25.0867 101.125 25.0867 95.3333V69.5933Z';

// Pressed pill shifted into chassis indentation (x: 8.88 to 29.85)
const MARK_KEY_PRESSED =
  'M29.8533 69.5933C29.8533 63.8017 25.1583 59.1067 19.3667 59.1067C13.575 59.1067 8.88 63.8017 8.88 69.5933V95.3333C8.88 101.125 13.575 105.82 19.3667 105.82C25.1583 105.82 29.8533 101.125 29.8533 95.3333V69.5933Z';

// Wordmark letter paths: 'l', 'k', 'W', 'a', 'e', 'i' stem
const WORDMARK_LETTER_PATHS = [
  'M3262 1442 c-10 -7 -12 -144 -10 -653 l3 -644 180 0 180 0 3 639 c1 463 -1 643 -9 652 -9 11 -49 14 -173 14 -88 0 -167 -4 -174 -8z',
  'M3728 1439 c-17 -9 -18 -51 -18 -642 0 -479 3 -636 12 -645 18 -18 342 -17 357 1 6 8 12 77 13 177 2 114 7 165 15 167 6 2 66 -72 132 -165 81 -113 131 -174 149 -181 18 -8 92 -11 217 -9 188 3 190 3 193 25 2 16 -47 92 -173 264 -155 214 -174 244 -161 258 183 208 326 379 326 391 0 36 -20 40 -196 40 -97 0 -184 -5 -202 -11 -22 -7 -68 -56 -157 -165 -70 -85 -130 -154 -136 -154 -5 0 -9 127 -9 318 0 234 -3 321 -12 330 -15 15 -325 16 -350 1z',
  'M117 1403 c-4 -3 -7 -14 -7 -23 0 -10 66 -194 146 -411 80 -217 175 -475 211 -574 37 -99 73 -191 82 -204 27 -42 68 -51 228 -51 160 0 193 9 227 62 8 13 51 120 96 238 45 118 88 222 96 230 12 13 16 13 27 0 8 -8 51 -112 97 -230 45 -118 89 -225 97 -238 33 -53 66 -62 228 -62 171 0 206 10 236 71 10 19 112 290 228 603 163 439 209 572 200 582 -9 11 -58 14 -228 14 -195 0 -219 -2 -247 -19 -33 -20 -42 -40 -172 -386 -39 -102 -53 -130 -68 -130 -15 0 -36 46 -110 238 -51 131 -98 245 -105 253 -28 34 -67 44 -169 44 -118 0 -146 -11 -176 -67 -12 -21 -58 -136 -104 -255 -94 -245 -104 -257 -138 -165 -147 401 -157 423 -188 455 l-32 32 -224 0 c-124 0 -228 -3 -231 -7z',
  'M2492 1130 c-159 -20 -188 -39 -226 -140 -31 -84 -32 -101 -8 -123 16 -15 47 -17 228 -17 179 0 214 -3 244 -18 34 -17 64 -58 54 -74 -3 -4 -83 -8 -177 -8 -251 0 -377 -35 -453 -124 -97 -114 -86 -319 23 -415 76 -67 135 -84 293 -85 154 -1 213 14 280 71 21 18 40 33 43 33 3 0 8 -14 12 -30 12 -54 35 -61 201 -58 l149 3 0 355 0 355 -28 60 c-49 105 -127 167 -254 201 -71 18 -282 26 -381 14z m295 -637 c-7 -62 -44 -97 -123 -113 -105 -22 -204 13 -204 72 0 67 49 87 209 88 l124 0 -6 -47z',
  'M5765 1133 c-113 -15 -239 -75 -309 -147 -98 -100 -136 -205 -136 -372 0 -121 22 -206 76 -286 91 -136 215 -194 439 -205 266 -12 446 61 524 216 26 49 26 63 3 84 -16 14 -43 17 -164 17 -124 0 -152 -3 -189 -20 -60 -27 -178 -27 -236 -1 -43 20 -73 62 -73 101 0 20 4 20 335 20 410 0 380 -12 375 154 -9 288 -200 449 -530 444 -47 0 -98 -3 -115 -5z m215 -288 c38 -20 60 -49 67 -89 l6 -36 -177 0 c-171 0 -176 1 -176 20 0 31 26 75 55 94 51 34 169 39 225 11z',
  'M4876 974 c-3 -8 -6 -195 -6 -414 0 -326 2 -400 14 -409 9 -8 66 -11 182 -9 l169 3 0 420 0 420 -176 3 c-155 2 -177 0 -183 -14z',
];

// Wordmark pill over "i"
const WORDMARK_LIME_PILL_PATH =
  'M4972 1599 c-26 -13 -55 -39 -70 -62 -25 -38 -27 -49 -30 -172 -5 -156 6 -202 54 -249 90 -88 239 -64 293 46 18 39 21 62 21 179 -1 178 -21 225 -113 264 -51 21 -104 19 -155 -6z';

interface SideKeyMarkProps {
  size?: number;
  variant?: 'primary' | 'reverse' | 'monochrome';
  isPressed?: boolean;
}

export const SideKeyMark: React.FC<SideKeyMarkProps> = ({
  size = 40,
  variant = 'reverse',
  isPressed = false,
}) => {
  const height = size;
  const width = (size * 115) / 143;

  const bodyColor =
    variant === 'primary' ? BRAND_COLORS.carbon : variant === 'reverse' ? BRAND_COLORS.chalk : '#FFFFFF';
  const keyColor = variant === 'monochrome' ? '#FFFFFF' : BRAND_COLORS.lime;

  return (
    <Svg width={width} height={height} viewBox="0 0 115 143" fill="none">
      <G>
        <Path d={MARK_BODY_PATH} fill={bodyColor} />
        <Path d={isPressed ? MARK_KEY_PRESSED : MARK_KEY_UNPRESSED} fill={keyColor} />
      </G>
    </Svg>
  );
};

interface WalkieWordmarkProps {
  height?: number;
  variant?: 'primary' | 'reverse' | 'monochrome';
}

export const WalkieWordmark: React.FC<WalkieWordmarkProps> = ({
  height = 28,
  variant = 'reverse',
}) => {
  const width = (height * 650) / 185;
  const textColor =
    variant === 'primary' ? BRAND_COLORS.carbon : variant === 'reverse' ? BRAND_COLORS.chalk : '#FFFFFF';
  const pillColor = variant === 'monochrome' ? '#FFFFFF' : BRAND_COLORS.lime;

  return (
    <Svg width={width} height={height} viewBox="0 0 650 185">
      <G transform="translate(0, 185) scale(0.1, -0.1)">
        <G fill={textColor}>
          {WORDMARK_LETTER_PATHS.map((p, idx) => (
            <Path key={idx} d={p} />
          ))}
        </G>
        <G fill={pillColor}>
          <Path d={WORDMARK_LIME_PILL_PATH} />
        </G>
      </G>
    </Svg>
  );
};

interface WalkieLockupProps {
  height?: number;
  variant?: 'primary' | 'reverse';
  isPressed?: boolean;
}

export const WalkieLockup: React.FC<WalkieLockupProps> = ({
  height = 36,
  variant = 'reverse',
  isPressed = false,
}) => {
  const width = (height * 880) / 200;
  const bodyColor = variant === 'primary' ? BRAND_COLORS.carbon : BRAND_COLORS.chalk;
  const keyPath = isPressed ? MARK_KEY_PRESSED : MARK_KEY_UNPRESSED;

  return (
    <Svg width={width} height={height} viewBox="0 0 880 200">
      <G transform="translate(20, 15) scale(1.18)">
        <Path d={MARK_BODY_PATH} fill={bodyColor} />
        <Path d={keyPath} fill={BRAND_COLORS.lime} />
      </G>
      <G transform="translate(190, 8)">
        <G transform="translate(0, 185) scale(0.1, -0.1)">
          <G fill={bodyColor}>
            {WORDMARK_LETTER_PATHS.map((p, idx) => (
              <Path key={idx} d={p} />
            ))}
          </G>
          <G fill={BRAND_COLORS.lime}>
            <Path d={WORDMARK_LIME_PILL_PATH} />
          </G>
        </G>
      </G>
    </Svg>
  );
};
