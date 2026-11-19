import { describe, expect, it } from 'vitest'
import { rebrandCopy, rewriteResourcePath, spaResourcePath } from './resource-paths'

describe('resource-paths (LITE/utils/resourcePaths.js)', () => {
  it('rewriteResourcePath maps the segment to the preferred one', () => {
    expect(rewriteResourcePath('/instances/1/git', true)).toBe('/projects/1/git')
    expect(rewriteResourcePath('instances?page=1', true)).toBe('projects?page=1')
    expect(rewriteResourcePath('/projects/1', false)).toBe('/instances/1')
    expect(rewriteResourcePath('/instances/1', false)).toBe('/instances/1')
    expect(rewriteResourcePath('/api/instances/1', true)).toBe('/api/projects/1')
    expect(rewriteResourcePath('', true)).toBe('')
  })

  it('spaResourcePath builds the SPA path under the preferred segment', () => {
    expect(spaResourcePath('12/general', true)).toBe('/projects/12/general')
    expect(spaResourcePath(12, false)).toBe('/instances/12')
    expect(spaResourcePath('/12', true)).toBe('/projects/12')
    expect(spaResourcePath('', true)).toBe('/projects')
  })

  it('rebrandCopy swaps the four English forms', () => {
    expect(rebrandCopy('Instances, Instance, instances and instance')).toBe('Projects, Project, projects and project')
    expect(rebrandCopy('instanceId')).toBe('instanceId')
  })

  it('rebrandCopy leaves a URL, a host name, an e-mail address and a path as they stand', () => {
    expect(rebrandCopy('No WordPress login page at https://instance.panelalpha.online/wp-login.php'))
      .toBe('No WordPress login page at https://instance.panelalpha.online/wp-login.php')
    expect(rebrandCopy('An instance at https://instance.example.com/instances/1 replied'))
      .toBe('A project at https://instance.example.com/instances/1 replied')
    expect(rebrandCopy('The instance instance.example.com answered, instance@Example.com too'))
      .toBe('The project instance.example.com answered, instance@Example.com too')
    expect(rebrandCopy('The instances list at /instances/1/git is empty'))
      .toBe('The projects list at /instances/1/git is empty')
    expect(rebrandCopy('Instance https://instance.example.com:8443/instances?page=1 answered'))
      .toBe('Project https://instance.example.com:8443/instances?page=1 answered')
  })

  it('rebrandCopy swaps the article together with the noun', () => {
    expect(rebrandCopy('Connect a repository to create an instance')).toBe('Connect a repository to create a project')
    expect(rebrandCopy('An instance is ready. An Instance too, an Instances list')).toBe('A project is ready. A Project too, a Projects list')
    expect(rebrandCopy('an instance\'s name, in an instance')).toBe('a project\'s name, in a project')
    expect(rebrandCopy('an instanceId')).toBe('an instanceId')
  })
})
