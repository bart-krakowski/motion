import { clamp, mix, progress } from "@popmotion/popcorn"
import { Axis, AxisDelta, Snapshot, BoxDelta, Box } from "./types"
import { NativeElement } from "../utils/use-native-element"
import { MotionStyle } from "../types"
import { MotionValue } from "../../value"
import { CustomValueType } from "../../types"
import { resolveMotionValue } from "../../value/utils/resolve-motion-value"

const clampProgress = clamp(0, 1)

export function snapshot(element: NativeElement): Snapshot {
    const { top, left, right, bottom } = element.getBoundingBox()
    const {
        backgroundColor,
        border,
        borderRadius,
        boxShadow,
        color,
        opacity,
    } = element.getComputedStyle()

    return {
        layout: {
            x: { min: left, max: right },
            y: { min: top, max: bottom },
        },
        style: {
            backgroundColor,
            border,
            borderRadius: borderRadius ? parseFloat(borderRadius) : 0,
            boxShadow,
            color: color || "",
            opacity: opacity !== null ? parseFloat(opacity) : 0,
        },
    }
}

/**
 * Calculate an appropriate transform origin for this delta.
 *
 * If components don't change size, it isn't really relavent what origin we provide.
 * When a component is scaling, we want to generate a visually appeasing transform origin and allow
 * the component to scale out (or in) from there. This means 0 for components whose left edge
 * is the same or beyond the `before`, 1 for the inverse, and 0-1 for in between.
 *
 * @param before
 * @param after
 */
export function calcOrigin(before: Axis, after: Axis): number {
    let origin = 0.5
    const beforeSize = before.max - before.min
    const afterSize = after.max - after.min

    if (beforeSize > afterSize) {
        origin = progress(before.min, before.max - afterSize, after.min)
    } else {
        origin = progress(after.min, after.max - beforeSize, before.min)
    }

    return clampProgress(origin)
}

export function calcTreeScale(deltas: BoxDelta[]): { x: number; y: number } {
    const numDeltas = deltas.length
    const scale = { x: 1, y: 1 }
    for (let i = 0; i < numDeltas; i++) {
        const delta = deltas[i]
        scale.x *= delta.x.scale
        scale.y *= delta.y.scale
    }

    return scale
}

/**
 *
 * @param before
 * @param after
 * @param origin
 */
export function calcTranslate(
    before: Axis,
    after: Axis,
    origin: number
): number {
    const beforePoint = mix(before.min, before.max, origin)
    const afterPoint = mix(after.min, after.max, origin)
    return beforePoint - afterPoint
}

export function scaledPoint({ scale, originPoint }: AxisDelta, point: number) {
    const distanceFromOrigin = point - originPoint
    const scaled = scale * distanceFromOrigin
    return originPoint + scaled
}

export function calcDelta(
    delta: AxisDelta,
    before: Axis,
    after: Axis,
    origin?: number
): void {
    const beforeSize = before.max - before.min
    const afterSize = after.max - after.min
    delta.scale = beforeSize / afterSize
    delta.origin = origin !== undefined ? origin : calcOrigin(before, after)
    delta.originPoint = after.min + delta.origin * afterSize
    delta.translate = calcTranslate(before, after, delta.origin)
}

export function calcBoxDelta(
    delta: BoxDelta,
    before: Box,
    after: Box,
    origin?: number
): void {
    calcDelta(delta.x, before.x, after.x, origin)
    calcDelta(delta.y, before.y, after.y, origin)
}

export function applyDelta(axis: Axis, delta: AxisDelta): void {
    axis.min = scaledPoint(delta, axis.min) + delta.translate
    axis.max = scaledPoint(delta, axis.max) + delta.translate
}

export function applyBoxDelta(box: Box, delta: BoxDelta): void {
    applyDelta(box.x, delta.x)
    applyDelta(box.y, delta.y)
}

export function applyTreeDeltas(box: Box, deltas: BoxDelta[]): void {
    const numDeltas = deltas.length

    for (let i = 0; i < numDeltas; i++) {
        applyBoxDelta(box, deltas[i])
    }
}

export const animatableStyles = [
    "opacity",
    "backgroundColor",
    "backgroundImage",
    "border",
    "color",
]
export const numAnimatableStyles = animatableStyles.length

export function resolve<T extends unknown>(
    defaultValue: T,
    value?: MotionValue | string | number | CustomValueType
): T {
    return value === undefined ? defaultValue : (resolveMotionValue(value) as T)
}

/**
 * Reset `element.style` to ensure we're not reading styles that have previously been animated.
 * If anything is set in the incoming style prop, use that, otherwise unset to ensure the
 * underlying CSS is read.
 *
 * @param styleProp
 */
export function resetStyles(styleProp: MotionStyle = {}, isExiting = false) {
    const styles = {
        x: 0,
        y: 0,
        scale: 1,
        scaleX: 1,
        scaleY: 1,
        rotate: 0,
        boxShadow: resolve("", styleProp.boxShadow),
        borderRadius: resolve("", styleProp.borderRadius),
        position: isExiting ? "absolute" : resolve("", styleProp.position),
    }

    for (let i = 0; i < numAnimatableStyles; i++) {
        const key = animatableStyles[i]
        styles[key] = resolve("", styleProp[key])
    }

    return styles
}