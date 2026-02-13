import { test, expect } from './fixtures'
import { loginAsAdmin } from './helpers/auth'
import { getAuthToken, apiGet } from './helpers/api'
import { createPlant, clickConnectivityTab } from './helpers/seed'

test.describe('Connectivity', () => {
  let token: string

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)
    const plants = await apiGet(request, '/plants/', token)
    if (plants.length === 0) {
      await createPlant(request, token, 'Connectivity Test Plant', 'CTP')
    }
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('connectivity hub loads with monitor tab', async ({ page }) => {
    await page.goto('/connectivity')
    await page.waitForTimeout(2000)

    await expect(page.getByRole('heading', { name: 'Connectivity Hub' })).toBeVisible({
      timeout: 10000,
    })

    // Monitor tab should be active by default
    await expect(page.getByText('Monitor')).toBeVisible({ timeout: 5000 })

    await test.info().attach('connectivity-hub-monitor', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('monitor tab shows empty state', async ({ page }) => {
    await page.goto('/connectivity')
    await page.waitForTimeout(2000)

    await expect(page.getByText(/No data sources configured/i)).toBeVisible({
      timeout: 5000,
    })

    await test.info().attach('connectivity-monitor-empty', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('servers tab renders with add button', async ({ page }) => {
    // Navigate directly to servers tab to avoid NavLink click issues
    await page.goto('/connectivity/servers')
    await page.waitForTimeout(2000)

    await expect(page.getByRole('button', { name: 'Add Server' }).first()).toBeVisible({
      timeout: 5000,
    })

    await test.info().attach('connectivity-servers-tab', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('add server shows protocol selector', async ({ page }) => {
    await page.goto('/connectivity/servers')
    await page.waitForTimeout(2000)

    await page.getByRole('button', { name: 'Add Server' }).first().click()
    await page.waitForTimeout(1000)

    // Protocol selector shows MQTT Broker and OPC-UA Server cards
    await expect(page.getByRole('heading', { name: 'MQTT Broker' })).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('heading', { name: 'OPC-UA Server' })).toBeVisible({ timeout: 5000 })

    await test.info().attach('connectivity-protocol-selector', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('MQTT server form renders required fields', async ({ page }) => {
    await page.goto('/connectivity/servers')
    await page.waitForTimeout(2000)

    await page.getByRole('button', { name: 'Add Server' }).first().click()
    await page.waitForTimeout(1000)

    // Select MQTT protocol (button name includes description text)
    await page.getByRole('button', { name: /MQTT Broker/i }).first().click()
    await page.waitForTimeout(1000)

    // Verify MQTT form heading and fields (labels are <label> without htmlFor, use heading + placeholder)
    await expect(page.getByRole('heading', { name: 'New MQTT Broker' })).toBeVisible({ timeout: 5000 })
    await expect(page.getByPlaceholder('Production MQTT')).toBeVisible({ timeout: 5000 })
    await expect(page.getByPlaceholder('mqtt.example.com')).toBeVisible({ timeout: 5000 })

    await test.info().attach('connectivity-mqtt-form', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('OPC-UA server form renders required fields', async ({ page }) => {
    await page.goto('/connectivity/servers')
    await page.waitForTimeout(2000)

    await page.getByRole('button', { name: 'Add Server' }).first().click()
    await page.waitForTimeout(1000)

    // Select OPC-UA protocol (button name includes description text)
    await page.getByRole('button', { name: /OPC-UA Server/i }).first().click()
    await page.waitForTimeout(1000)

    // Verify OPC-UA form heading and fields (labels are <label> without htmlFor, use heading + placeholder)
    await expect(page.getByRole('heading', { name: 'New OPC-UA Server' })).toBeVisible({ timeout: 5000 })
    await expect(page.getByPlaceholder('PLC Controller 1')).toBeVisible({ timeout: 5000 })

    await test.info().attach('connectivity-opcua-form', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('browse tab renders', async ({ page }) => {
    await page.goto('/connectivity')
    await page.waitForTimeout(2000)

    await clickConnectivityTab(page, 'Browse')

    await test.info().attach('connectivity-browse-tab', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })

  test('mapping tab renders', async ({ page }) => {
    await page.goto('/connectivity')
    await page.waitForTimeout(2000)

    await clickConnectivityTab(page, 'Mapping')

    await expect(page.getByText(/Data Source Mappings/i)).toBeVisible({ timeout: 5000 })

    await test.info().attach('connectivity-mapping-tab', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })
})
