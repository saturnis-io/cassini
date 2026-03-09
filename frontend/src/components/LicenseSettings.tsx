import { useState, useCallback, useRef, type DragEvent } from 'react'
import { Upload, CheckCircle2, AlertCircle, Shield, Clock, Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLicenseStatus, useUploadLicense } from '@/api/hooks'

export function LicenseSettings() {
	const { data: status, isLoading } = useLicenseStatus()
	const uploadMutation = useUploadLicense()
	const [licenseKey, setLicenseKey] = useState('')
	const [isDragging, setIsDragging] = useState(false)
	const fileInputRef = useRef<HTMLInputElement>(null)

	const handleUpload = useCallback(() => {
		const trimmed = licenseKey.trim()
		if (!trimmed) return
		uploadMutation.mutate(trimmed, {
			onSuccess: () => setLicenseKey(''),
		})
	}, [licenseKey, uploadMutation])

	const handleFileRead = useCallback((file: File) => {
		const reader = new FileReader()
		reader.onload = (e) => {
			const content = e.target?.result
			if (typeof content === 'string') {
				setLicenseKey(content.trim())
			}
		}
		reader.readAsText(file)
	}, [])

	const handleDrop = useCallback(
		(e: DragEvent<HTMLDivElement>) => {
			e.preventDefault()
			setIsDragging(false)
			const file = e.dataTransfer.files[0]
			if (file) handleFileRead(file)
		},
		[handleFileRead],
	)

	const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
		e.preventDefault()
		setIsDragging(true)
	}, [])

	const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
		e.preventDefault()
		setIsDragging(false)
	}, [])

	const handleFileSelect = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0]
			if (file) handleFileRead(file)
		},
		[handleFileRead],
	)

	const isCommercial = status?.edition === 'commercial'
	const isExpired = status?.is_expired ?? false

	if (isLoading) {
		return (
			<div className="flex items-center justify-center py-12">
				<div className="border-primary h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" />
			</div>
		)
	}

	return (
		<div className="mx-auto max-w-2xl space-y-6">
			<div>
				<h2 className="text-foreground text-lg font-semibold">License</h2>
				<p className="text-muted-foreground mt-1 text-sm">
					Manage your Cassini license to unlock commercial features.
				</p>
			</div>

			{/* Current License Status */}
			<div className="border-border bg-card rounded-lg border p-5">
				<div className="mb-4 flex items-center gap-2">
					<Shield className="text-muted-foreground h-5 w-5" />
					<h3 className="text-foreground text-sm font-semibold">Current License</h3>
				</div>

				<div className="grid grid-cols-2 gap-4">
					<StatusItem
						label="Edition"
						value={
							isCommercial ? (
								<span className="text-green-600 dark:text-green-400">Commercial</span>
							) : (
								<span className="text-muted-foreground">Community</span>
							)
						}
					/>
					<StatusItem
						label="Tier"
						value={<span className="capitalize">{status?.tier ?? 'community'}</span>}
					/>
					<StatusItem label="Max Plants" value={status?.max_plants ?? 1} />
					{status?.license_name && (
						<StatusItem
							label="License Name"
							value={status.license_name}
							icon={<Building2 className="text-muted-foreground h-3.5 w-3.5" />}
						/>
					)}
					{status?.expires_at && (
						<StatusItem
							label="Expires"
							value={
								<span className={cn(isExpired && 'text-destructive font-medium')}>
									{new Date(status.expires_at).toLocaleDateString()}
								</span>
							}
							icon={<Clock className="text-muted-foreground h-3.5 w-3.5" />}
						/>
					)}
					{status?.days_until_expiry != null && !isExpired && (
						<StatusItem
							label="Days Remaining"
							value={
								<span
									className={cn(
										status.days_until_expiry <= 30 && 'text-amber-600 dark:text-amber-400',
										status.days_until_expiry <= 7 && 'text-destructive font-medium',
									)}
								>
									{status.days_until_expiry}
								</span>
							}
						/>
					)}
				</div>

				{isExpired && (
					<div className="mt-4 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
						<AlertCircle className="h-4 w-4 shrink-0" />
						<span>
							Your license has expired. Upload a new key or{' '}
							<a
								href="https://saturnis.io/cassini/pricing"
								target="_blank"
								rel="noopener noreferrer"
								className="underline"
							>
								renew your license
							</a>
							.
						</span>
					</div>
				)}
			</div>

			{/* Upload License Key */}
			<div className="border-border bg-card rounded-lg border p-5">
				<div className="mb-4 flex items-center gap-2">
					<Upload className="text-muted-foreground h-5 w-5" />
					<h3 className="text-foreground text-sm font-semibold">Upload License Key</h3>
				</div>

				<p className="text-muted-foreground mb-4 text-sm">
					Paste your license key below or drag and drop your <code>.license</code> file.
				</p>

				{/* Drop zone / textarea */}
				<div
					onDrop={handleDrop}
					onDragOver={handleDragOver}
					onDragLeave={handleDragLeave}
					className={cn(
						'relative rounded-lg border-2 border-dashed transition-colors',
						isDragging
							? 'border-primary bg-primary/5'
							: 'border-border hover:border-muted-foreground/50',
					)}
				>
					<textarea
						value={licenseKey}
						onChange={(e) => setLicenseKey(e.target.value)}
						placeholder="Paste your license key (JWT) here..."
						rows={5}
						className="bg-transparent text-foreground placeholder:text-muted-foreground w-full resize-none rounded-lg px-4 py-3 font-mono text-xs focus:outline-none"
					/>
					{isDragging && (
						<div className="bg-primary/5 absolute inset-0 flex items-center justify-center rounded-lg">
							<p className="text-primary text-sm font-medium">Drop license file here</p>
						</div>
					)}
				</div>

				{/* File picker button */}
				<div className="mt-3 flex items-center gap-3">
					<button
						type="button"
						onClick={() => fileInputRef.current?.click()}
						className="text-muted-foreground hover:text-foreground text-xs underline"
					>
						Or browse for a file...
					</button>
					<input
						ref={fileInputRef}
						type="file"
						accept=".license,.key,.jwt,.txt,.pem"
						onChange={handleFileSelect}
						className="hidden"
					/>
				</div>

				{/* Upload button */}
				<div className="mt-4 flex items-center gap-3">
					<button
						type="button"
						onClick={handleUpload}
						disabled={!licenseKey.trim() || uploadMutation.isPending}
						className={cn(
							'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
							'bg-primary text-primary-foreground hover:bg-primary/90',
							'disabled:pointer-events-none disabled:opacity-50',
						)}
					>
						{uploadMutation.isPending ? (
							<>
								<div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
								Validating...
							</>
						) : (
							<>
								<Upload className="h-4 w-4" />
								Upload License
							</>
						)}
					</button>

					{uploadMutation.isSuccess && (
						<span className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
							<CheckCircle2 className="h-4 w-4" />
							License activated
						</span>
					)}
				</div>
			</div>
		</div>
	)
}

function StatusItem({
	label,
	value,
	icon,
}: {
	label: string
	value: React.ReactNode
	icon?: React.ReactNode
}) {
	return (
		<div>
			<dt className="text-muted-foreground text-xs font-medium">{label}</dt>
			<dd className="text-foreground mt-0.5 flex items-center gap-1.5 text-sm">
				{icon}
				{value}
			</dd>
		</div>
	)
}
