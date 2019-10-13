import { Icon } from 'office-ui-fabric-react/lib/Icon';
import * as React from 'react';
import ReactMarkdown from 'react-markdown';
import { Link } from 'react-router-dom';
import timeago from 'timeago.js';

import { config } from '../config';
import Dependencies from './Dependencies';
import Dependents from './Dependents';
import { PackageType, InstallationInfo } from './InstallationInfo';
import LicenseInfo from './LicenseInfo';
import * as Registration from './Registration';
import SourceRepository from './SourceRepository';

import './DisplayPackage.css';

interface IDisplayPackageProps {
  match: {
    params: {
      id: string;
      version?: string;
    }
  }
}

interface IPackage {
  id: string;
  latestVersion: string;
  hasReadme: boolean;
  description: string;
  readme: string;
  lastUpdate: Date;
  iconUrl: string;
  projectUrl: string;
  licenseUrl: string;
  downloadUrl: string;
  repositoryUrl: string;
  repositoryType: string;
  totalDownloads: number;
  packageType: PackageType;
  downloads: number;
  authors: string;
  tags: string[];
  version: string;
  normalizedVersion: string;
  versions: IPackageVersion[];
  dependencyGroups: Registration.IDependencyGroup[];
}

interface IPackageVersion {
  version: string;
  downloads: number;
  date: Date;
}

interface IDisplayPackageState {
  package?: IPackage;
  loading: boolean;
}

class DisplayPackage extends React.Component<IDisplayPackageProps, IDisplayPackageState> {

  private readonly defaultIconUrl: string = 'https://www.nuget.org/Content/gallery/img/default-package-icon-256x256.png';

  private id: string;
  private version?: string;

  private registrationController: AbortController;
  private readmeController: AbortController;

  constructor(props: IDisplayPackageProps) {
    super(props);

    this.registrationController = new AbortController();
    this.readmeController = new AbortController();

    this.id = props.match.params.id.toLowerCase();
    this.version = props.match.params.version;
    this.state = {package: undefined, loading: true};
  }

  public componentWillUnmount() {
    this.registrationController.abort();
    this.readmeController.abort();
  }

  public componentDidUpdate(previous: IDisplayPackageProps) {
    // This is used to switch between versions of the same package.
    if (previous.match.params.id !== this.props.match.params.id ||
      previous.match.params.version !== this.props.match.params.version) {
      this.registrationController.abort();
      this.readmeController.abort();

      this.registrationController = new AbortController();
      this.readmeController = new AbortController();

      this.id = this.props.match.params.id.toLowerCase();
      this.version = this.props.match.params.version;
      this.setState({package: undefined});
      this.componentDidMount();
    }
  }

  public componentDidMount() {
    const url = `${config.apiUrl}/v3/registration/${this.id}/index.json`;

    fetch(url, {signal: this.registrationController.signal}).then(response => {
      return (response.ok) ? response.json() : null;
    }).then(json => {
      if (!json) {
        this.setState(prevState => {
          return { ...prevState, loading: false };
        });

        return;
      }

      const results = json as Registration.IRegistrationIndex;

      const latestVersion = results.items[0].upper;
      let currentItem: Registration.IRegistrationPageItem | undefined;
      let lastUpdate: Date | undefined;

      const versions: IPackageVersion[] = [];

      for (const entry of results.items[0].items) {
        const normalizedVersion = this.normalizeVersion(entry.catalogEntry.version);
        versions.push({
          date: new Date(entry.catalogEntry.published),
          downloads: entry.catalogEntry.downloads,
          version: normalizedVersion,
        });

        if ((!currentItem && normalizedVersion === latestVersion) ||
          (this.version && normalizedVersion === this.version)) {
          currentItem = entry;
        }

        const published = new Date(entry.catalogEntry.published);
        if (!lastUpdate || lastUpdate < published) {
          lastUpdate = published;
        }
      }

      if (currentItem && lastUpdate) {
        let readme = "";

        const isDotnetTool = (currentItem.catalogEntry.packageTypes &&
          currentItem.catalogEntry.packageTypes.indexOf("DotnetTool") !== -1);
        const isDotnetTemplate = (currentItem.catalogEntry.packageTypes &&
            currentItem.catalogEntry.packageTypes.indexOf("Template") !== -1);
        const packageType = isDotnetTool
          ? PackageType.DotnetTool
          : isDotnetTemplate
            ? PackageType.DotnetTemplate
            : PackageType.Dependency;

        console.log(packageType);

        this.setState({
          loading: false,
          package: {
            ...currentItem.catalogEntry,
            downloadUrl: currentItem.packageContent,
            packageType,
            lastUpdate,
            latestVersion,
            normalizedVersion: this.normalizeVersion(currentItem.catalogEntry.version),
            readme,
            totalDownloads: results.totalDownloads,
            versions
          }
        });

        if (currentItem.catalogEntry.hasReadme) {
          const readmeUrl = `${config.apiUrl}/v3/package/${this.id}/${currentItem.catalogEntry.version}/readme`;

          fetch(readmeUrl, {signal: this.readmeController.signal}).then(response => {
            return response.text();
          }).then(result => {
            this.setState(prevState => {
              const state = {...prevState};

              state.package!.readme = result;

              return state;
            });
          });
        }
      }
    // tslint:disable-next-line:no-console
    }).catch((e) => console.log("Failed to load package.", e));
  }

  public render() {
    if (this.state.loading) {
      return (
        <div>...</div>
      );
    } else if (!this.state.package) {
      return (
        <div>Could not find package '{this.id}'.</div>
      );
    } else {
      return (
        <div className="row display-package">
          <aside className="col-sm-1 package-icon">
            <img
              src={this.state.package.iconUrl}
              className="img-responsive"
              onError={this.loadDefaultIcon}
              alt="The package icon" />
          </aside>
          <article className="col-sm-8 package-details-main">
            <div className="package-title">
              <h1>
                {this.state.package.id}
                <small className="text-nowrap">{this.state.package.version}</small>
              </h1>

            </div>

            <InstallationInfo
              id={this.state.package.id}
              version={this.state.package.normalizedVersion}
              packageType={this.state.package.packageType} />

            {(() => {
              if (this.state.package.hasReadme) {
                return (
                  <ReactMarkdown source={this.state.package.readme} />
                );
              } else {
                return (
                  <div className="package-description">
                    {this.state.package.description}
                  </div>
                );
              }
            })()}

            <ExpandableSection title="Dependents" expanded={false}>
              <Dependents packageId={this.state.package.id} />
            </ExpandableSection>

            <ExpandableSection title="Dependencies" expanded={false}>
              <Dependencies dependencyGroups={this.state.package.dependencyGroups} />
            </ExpandableSection>

            <ExpandableSection title="Versions" expanded={true}>
              {this.state.package.versions.map(value => (
                <div key={value.version}>
                  <span><Link to={`/packages/${this.state.package!.id}/${value.version}`}>{value.version}</Link>: </span>
                  <span>{this.dateToString(value.date)}</span>
                </div>
              ))}
            </ExpandableSection>
          </article>
          <aside className="col-sm-3 package-details-info">
            <div>
              <h2>Info</h2>

              <ul className="list-unstyled ms-Icon-ul">
                <li>
                  <Icon iconName="History" className="ms-Icon" />
                  Last updated {timeago().format(this.state.package.lastUpdate)}
                </li>
                {this.state.package.projectUrl &&
                  <li>
                    <Icon iconName="Globe" className="ms-Icon" />
                    <a href={this.state.package.projectUrl}>{this.state.package.projectUrl}</a>
                  </li>
                }
                <SourceRepository url={this.state.package.repositoryUrl} type={this.state.package.repositoryType} />
                <LicenseInfo url={this.state.package.licenseUrl} />
                <li>
                  <Icon iconName="CloudDownload" className="ms-Icon" />
                  <a href={this.state.package.downloadUrl}>Download package</a>
                </li>
              </ul>
            </div>

            <div>
              <h2>Statistics</h2>

              <ul className="list-unstyled ms-Icon-ul">
                <li>
                  <Icon iconName="Download" className="ms-Icon" />
                  {this.state.package.totalDownloads.toLocaleString()} total downloads
                </li>
                <li>
                  <Icon iconName="GiftBox" className="ms-Icon" />
                  {this.state.package.downloads.toLocaleString()} downloads of latest version
                </li>
              </ul>
            </div>

            <div>
              <h1>Authors</h1>

              <p>{(!this.state.package.authors) ? 'Unknown' : this.state.package.authors}</p>
            </div>
          </aside>
        </div>
      );
    }
  }

  private loadDefaultIcon = (e: React.SyntheticEvent<HTMLImageElement>) => {
    e.currentTarget.src = this.defaultIconUrl;
  }

  private dateToString(date: Date): string {
    return `${date.getMonth()+1}/${date.getDate()}/${date.getFullYear()}`;
  }

  private normalizeVersion(version: string): string {
    const buildMetadataStart = version.indexOf('+');
    return buildMetadataStart === -1
      ? version
      : version.substring(0, buildMetadataStart);
  }
}

interface IExpandableSectionProps {
  title: string;
  expanded: boolean;
}

interface IExpandableSectionState {
  expanded: boolean;
}

class ExpandableSection extends React.Component<IExpandableSectionProps, IExpandableSectionState> {
  constructor(props: IExpandableSectionProps) {
    super(props);

    this.state = { ...props };
  }

  public render() {
    if (this.state.expanded) {
      return (
        <div className="expandable-section">
          <h2>
            <button type="button" onClick={this.collapse} className="link-button">
              <Icon iconName="ChevronDown" className="ms-Icon" />
              <span>{this.props.title}</span>
            </button>
          </h2>

          {this.props.children}
        </div>
      );
    } else {
      return (
        <div className="expandable-section">
          <h2>
            <button type="button" onClick={this.expand} className="link-button">
              <Icon iconName="ChevronRight" className="ms-Icon" />
              <span>{this.props.title}</span>
            </button>
          </h2>
        </div>
      );
    }
  }

  private collapse = () => this.setState({expanded: false});
  private expand = () => this.setState({expanded: true});
}

export default DisplayPackage;
