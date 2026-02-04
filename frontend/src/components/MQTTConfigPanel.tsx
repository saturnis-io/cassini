import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { brokerApi, providerApi } from '@/api/client'
import { HelpTooltip } from './HelpTooltip'
import type { MQTTBroker } from '@/types'

interface BrokerFormData {
  name: string
  host: string
  port: number
  username: string
  password: string
  client_id: string
  keepalive: number
  use_tls: boolean
}

const defaultFormData: BrokerFormData = {
  name: '',
  host: 'localhost',
  port: 1883,
  username: '',
  password: '',
  client_id: 'openspc-client',
  keepalive: 60,
  use_tls: false,
}

export function MQTTConfigPanel() {
  const queryClient = useQueryClient()
  const [editingBroker, setEditingBroker] = useState<MQTTBroker | null>(null)
  const [formData, setFormData] = useState<BrokerFormData>(defaultFormData)
  const [showForm, setShowForm] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  // Fetch brokers
  const { data: brokersResponse, isLoading: loadingBrokers } = useQuery({
    queryKey: ['brokers'],
    queryFn: () => brokerApi.list(),
  })

  // Fetch provider status
  const { data: providerStatus, isLoading: loadingStatus } = useQuery({
    queryKey: ['providerStatus'],
    queryFn: () => providerApi.getStatus(),
    refetchInterval: 5000, // Refresh every 5 seconds
  })

  const brokers = brokersResponse?.items || []

  // Create broker mutation
  const createMutation = useMutation({
    mutationFn: brokerApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brokers'] })
      setShowForm(false)
      setFormData(defaultFormData)
    },
  })

  // Update broker mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<MQTTBroker & { password?: string }> }) =>
      brokerApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brokers'] })
      setEditingBroker(null)
      setShowForm(false)
      setFormData(defaultFormData)
    },
  })

  // Delete broker mutation
  const deleteMutation = useMutation({
    mutationFn: brokerApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brokers'] })
    },
  })

  // Connect mutation
  const connectMutation = useMutation({
    mutationFn: brokerApi.connect,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providerStatus'] })
      queryClient.invalidateQueries({ queryKey: ['brokers'] })
    },
  })

  // Disconnect mutation
  const disconnectMutation = useMutation({
    mutationFn: brokerApi.disconnect,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providerStatus'] })
    },
  })

  // Test connection mutation
  const testMutation = useMutation({
    mutationFn: brokerApi.test,
    onSuccess: (result) => {
      setTestResult(result)
    },
    onError: (error) => {
      setTestResult({ success: false, message: error.message })
    },
  })

  // Restart TAG provider mutation
  const restartMutation = useMutation({
    mutationFn: providerApi.restartTagProvider,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providerStatus'] })
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const data = {
      ...formData,
      username: formData.username || undefined,
      password: formData.password || undefined,
    }

    if (editingBroker) {
      updateMutation.mutate({ id: editingBroker.id, data })
    } else {
      createMutation.mutate(data)
    }
  }

  const handleEdit = (broker: MQTTBroker) => {
    setEditingBroker(broker)
    setFormData({
      name: broker.name,
      host: broker.host,
      port: broker.port,
      username: broker.username || '',
      password: '',
      client_id: broker.client_id,
      keepalive: broker.keepalive,
      use_tls: broker.use_tls,
    })
    setShowForm(true)
  }

  const handleCancel = () => {
    setEditingBroker(null)
    setFormData(defaultFormData)
    setShowForm(false)
    setTestResult(null)
  }

  const handleTest = () => {
    setTestResult(null)
    testMutation.mutate({
      host: formData.host,
      port: formData.port,
      username: formData.username || undefined,
      password: formData.password || undefined,
      use_tls: formData.use_tls,
    })
  }

  const mqttStatus = providerStatus?.mqtt
  const tagStatus = providerStatus?.tag_provider

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            Connection Status
            <HelpTooltip helpKey="mqtt_connection" />
          </h3>
          {mqttStatus?.is_connected && (
            <button
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
              className="px-3 py-1 text-sm bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 disabled:opacity-50"
            >
              {disconnectMutation.isPending ? 'Disconnecting...' : 'Disconnect'}
            </button>
          )}
        </div>

        {loadingStatus ? (
          <div className="text-muted-foreground">Loading status...</div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-muted-foreground">MQTT Connection</div>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${mqttStatus?.is_connected ? 'bg-green-500' : 'bg-red-500'}`}
                />
                <span>{mqttStatus?.is_connected ? 'Connected' : 'Disconnected'}</span>
              </div>
              {mqttStatus?.broker_name && (
                <div className="text-sm text-muted-foreground mt-1">
                  Broker: {mqttStatus.broker_name}
                </div>
              )}
              {mqttStatus?.error_message && (
                <div className="text-sm text-destructive mt-1">{mqttStatus.error_message}</div>
              )}
            </div>
            <div>
              <div className="text-sm text-muted-foreground">TAG Provider</div>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${tagStatus?.is_running ? 'bg-green-500' : 'bg-yellow-500'}`}
                />
                <span>{tagStatus?.is_running ? 'Running' : 'Stopped'}</span>
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                {tagStatus?.characteristics_count || 0} characteristics subscribed
              </div>
              <div className="text-sm text-muted-foreground">
                {tagStatus?.samples_processed || 0} samples processed
              </div>
              {mqttStatus?.is_connected && (
                <button
                  onClick={() => restartMutation.mutate()}
                  disabled={restartMutation.isPending}
                  className="mt-2 px-3 py-1 text-sm bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 disabled:opacity-50"
                >
                  {restartMutation.isPending ? 'Restarting...' : 'Restart TAG Provider'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Broker List */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            MQTT Brokers
            <HelpTooltip helpKey="mqtt_broker" />
          </h3>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="px-3 py-1 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
            >
              Add Broker
            </button>
          )}
        </div>

        {loadingBrokers ? (
          <div className="text-muted-foreground">Loading brokers...</div>
        ) : brokers.length === 0 && !showForm ? (
          <div className="text-muted-foreground text-center py-8">
            No MQTT brokers configured. Click "Add Broker" to create one.
          </div>
        ) : (
          <div className="space-y-3">
            {brokers.map((broker) => (
              <div
                key={broker.id}
                className={`p-4 rounded-lg border ${
                  broker.is_active ? 'border-primary bg-primary/5' : 'border-border'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      {broker.name}
                      {broker.is_active && (
                        <span className="px-2 py-0.5 text-xs bg-primary text-primary-foreground rounded">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {broker.host}:{broker.port}
                      {broker.use_tls && ' (TLS)'}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {!broker.is_active && (
                      <button
                        onClick={() => connectMutation.mutate(broker.id)}
                        disabled={connectMutation.isPending}
                        className="px-3 py-1 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
                      >
                        {connectMutation.isPending ? 'Connecting...' : 'Connect'}
                      </button>
                    )}
                    <button
                      onClick={() => handleEdit(broker)}
                      className="px-3 py-1 text-sm bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Delete this broker?')) {
                          deleteMutation.mutate(broker.id)
                        }
                      }}
                      disabled={deleteMutation.isPending || broker.is_active}
                      className="px-3 py-1 text-sm bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Broker Form */}
        {showForm && (
          <form onSubmit={handleSubmit} className="mt-4 p-4 border border-border rounded-lg">
            <h4 className="font-medium mb-4">{editingBroker ? 'Edit Broker' : 'New Broker'}</h4>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg"
                  placeholder="Production MQTT"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Host</label>
                <input
                  type="text"
                  value={formData.host}
                  onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg"
                  placeholder="mqtt.example.com"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Port</label>
                <input
                  type="number"
                  value={formData.port}
                  onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || 1883 })}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg"
                  min={1}
                  max={65535}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Client ID</label>
                <input
                  type="text"
                  value={formData.client_id}
                  onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Username (optional)</label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Password (optional)</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg"
                  placeholder={editingBroker ? '(unchanged)' : ''}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Keepalive (seconds)</label>
                <input
                  type="number"
                  value={formData.keepalive}
                  onChange={(e) => setFormData({ ...formData, keepalive: parseInt(e.target.value) || 60 })}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg"
                  min={5}
                  max={3600}
                />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <input
                  type="checkbox"
                  id="use_tls"
                  checked={formData.use_tls}
                  onChange={(e) => setFormData({ ...formData, use_tls: e.target.checked })}
                  className="rounded"
                />
                <label htmlFor="use_tls" className="text-sm">Use TLS encryption</label>
              </div>
            </div>

            {/* Test Result */}
            {testResult && (
              <div
                className={`mt-4 p-3 rounded-lg ${
                  testResult.success ? 'bg-green-500/10 text-green-600' : 'bg-destructive/10 text-destructive'
                }`}
              >
                {testResult.message}
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={handleTest}
                disabled={testMutation.isPending || !formData.host}
                className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 disabled:opacity-50"
              >
                {testMutation.isPending ? 'Testing...' : 'Test Connection'}
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
              >
                {editingBroker ? 'Update' : 'Create'}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 bg-muted text-muted-foreground rounded-lg hover:bg-muted/80"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Subscribed Topics */}
      {mqttStatus?.subscribed_topics && mqttStatus.subscribed_topics.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-4">Subscribed Topics</h3>
          <div className="space-y-1">
            {mqttStatus.subscribed_topics.map((topic, index) => (
              <div key={index} className="text-sm font-mono text-muted-foreground">
                {topic}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
