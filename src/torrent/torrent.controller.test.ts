import {
	linkSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import environment from '../environment.js'
import type { LibraryController } from '../library/library.controller.js'
import type { TargetLibraryFile } from '../library/library.model.js'
import type { EpisodeMetadata } from '../metadata/metadata.model.js'
import type { MetadataController } from '../metadata/metadata.controller.js'
import type { PipelineController } from '../pipeline/pipeline.controller.js'
import { Context } from '../util/context.js'
import type { ITorrentController, Torrent } from './torrent.model.js'
import { TorrentController } from './torrent.controller.js'

const CRC32 = 'ABCD1234'
const DESTINATION_NAME = 'One Pace - S01E01.mkv'
const SOURCE_NAME = `One Pace - S01E01 [${CRC32}].mkv`

describe('Torrent import', () => {
	let root: string
	let downloads: string
	let library: string
	let source: string
	let destination: string

	let controller: TorrentController
	let updatemetadata: ReturnType<typeof vi.fn>
	let updateTorrentCategory: ReturnType<typeof vi.fn>

	const torrent: Torrent = {
		hash: 'torrent-hash',
		content_path: '',
		name: SOURCE_NAME,
	}

	const episode = {
		arc: 1,
		episode: 1,
		title: 'Romance Dawn',
	} as EpisodeMetadata

	beforeEach(() => {
		root = mkdtempSync(path.join(tmpdir(), 'onepacerr-import-'))
		downloads = path.join(root, 'downloads')
		library = path.join(root, 'library')
		source = path.join(downloads, SOURCE_NAME)
		destination = path.join(library, DESTINATION_NAME)

		mkdirSync(downloads, { recursive: true })
		mkdirSync(library, { recursive: true })

		torrent.content_path = downloads

		environment.MOUNT_DOWNLOADS_TORRENT = ''
		environment.MOUNT_DOWNLOADS_ONEPACERR = ''
		environment.MOUNT_LIBRARY_MEDIA_SERVER = ''
		environment.MOUNT_LIBRARY_ONEPACERR = ''
		environment.LIBRARY_USE_HARDLINKS = true
		environment.PIPELINE_SKIP_DOWNLOADS = false
		environment.PIPELINE_SKIP_DOWNLOADS_IMPORTS = false

		updatemetadata = vi.fn().mockResolvedValue(undefined)
		Context.pipeline = {
			updatemetadata,
		} as unknown as PipelineController

		Context.metadata = {
			findEpisodeByCRC32: vi.fn().mockResolvedValue(episode),
			findCRC32: vi.fn().mockResolvedValue(CRC32),
		} as unknown as MetadataController

		Context.library = {
			getTargetLibraryEpisodeFile: vi.fn().mockResolvedValue({
				path: `${library}${path.sep}`,
				filename: DESTINATION_NAME,
			} as TargetLibraryFile),
		} as unknown as LibraryController

		updateTorrentCategory = vi.fn().mockResolvedValue(undefined)
		const client = {
			torrentClient: 'qbittorrent',
			updateTorrentCategory,
		} as unknown as ITorrentController

		controller = new TorrentController()
		;(controller as unknown as { client: ITorrentController }).client = client
	})

	afterEach(() => {
		rmSync(root, { recursive: true, force: true })
		vi.clearAllMocks()
	})

	const importTorrent = () =>
		(
			controller as unknown as {
				importTorrentFiles: (torrent: Torrent) => Promise<void>
			}
		).importTorrentFiles(torrent)

	it('Does not recreate an episode that is already imported', async () => {
		writeFileSync(source, 'episode payload')
		linkSync(source, destination) // the episode was imported on a previous run
		const importedAt = statSync(destination).ctimeMs

		await importTorrent()

		expect(statSync(destination).ctimeMs).toBe(importedAt)
		expect(updatemetadata).not.toHaveBeenCalled()
		expect(updateTorrentCategory).toHaveBeenCalledWith(
			torrent,
			environment.TORRENT_CATEGORY_ONCE_COMPLETED,
		)
	})
})
