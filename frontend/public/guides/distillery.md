# Distillery — Demo Companion Guide

## Overview

This seed models a craft distillery operation with multiple production sites. It demonstrates multi-plant navigation, non-normal distribution handling for ABV measurements, correlated multivariate analysis for spirit profiles, and CUSUM/EWMA for barrel aging monitoring.

**Login:** `admin` / `password`
**Plants:** Main Distillery, Barrel Warehouse, Bottling Line

## Walkthrough

### 1. Multi-Plant Navigation

> After login, click the **plant switcher** in the header.

- Three plants represent distinct stages of production: distillation, aging, bottling.
- Each plant has its own characteristics, samples, and configurations.
- Switch between plants to show how data is isolated yet accessible to authorized users.

**Talking point:** A distillery engineer needs to see all three sites. A bottling line operator only needs their line. Cassini's plant-scoped roles handle this — same login, different visibility.

### 2. Non-Normal ABV Distribution

> Switch to the **Main Distillery** plant and find the **ABV** characteristic.

- Alcohol by volume readings are often right-skewed (bounded at 0%, clustered near target).
- Open **Analytics > Capability** to see the distribution analysis.
- The auto-detection cascade tries Normal first, then Box-Cox transform, then fits Lognormal, Weibull, Gamma, and Beta.
- Capability indices use percentile methods matched to the fitted distribution.

**Key insight:** A normal-assumption Cpk on skewed ABV data will underestimate the lower tail risk (too-low ABV = regulatory non-compliance) and overestimate the upper tail.

### 3. Multivariate Spirit Profile

> Navigate to **Analytics** in the sidebar.

- Spirit quality is defined by correlated properties: ABV, pH, ester content, congener levels.
- The correlation matrix reveals which parameters move together.
- T-squared monitoring catches combinations that are individually in-spec but collectively abnormal.

**Example scenario:** ABV is at 40.1% (in spec) and pH is at 4.2 (in spec), but the combination of high ABV + low pH has never been seen before. T-squared flags it; individual charts do not.

### 4. CUSUM for Aging Drift

> Switch to the **Barrel Warehouse** plant and find the **Angel's Share** or aging characteristic.

- Barrel aging is a slow, directional process — alcohol evaporates gradually (the "angel's share").
- CUSUM detects when the evaporation rate deviates from the expected profile.
- An accelerating CUSUM could indicate: improper storage temperature, barrel integrity issues, or humidity control failure.

### 5. EWMA for Bottling Consistency

> Switch to the **Bottling Line** plant.

- Fill volume and ABV at bottling must be tightly controlled for regulatory labeling.
- EWMA smooths the high-frequency noise from the filling machine to reveal true process drift.
- A lambda of 0.2 gives good balance between responsiveness and smoothing for bottling speeds.

### 6. Configuration Across Plants

> Navigate to **Configuration** in the sidebar.

- Show how each plant has its own hierarchy: Lines > Stations > Characteristics.
- Demonstrate that rule presets, specification limits, and chart types are configured per-characteristic.
- Point out the breadcrumb path display — characteristic names are not unique across plants.

## Quick Reference Checklist

- [ ] Multi-plant — three sites, plant switcher, scoped roles
- [ ] Non-normal ABV — distribution fitting, percentile Cpk, skew handling
- [ ] Multivariate — correlation matrix, T-squared, spirit profile
- [ ] CUSUM aging — slow directional drift, angel's share monitoring
- [ ] EWMA bottling — fill volume consistency, smoothing for noise
- [ ] Breadcrumb paths — Plant > Line > Station > Characteristic display
- [ ] Show Your Work — verify non-normal Cpk uses fitted distribution
